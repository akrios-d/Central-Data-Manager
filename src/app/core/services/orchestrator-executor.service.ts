import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { Chain, ChainStep } from '../models/chain.model';
import {
  OrchGraph,
  OrchNode,
  OrchNodeRun,
  OrchNodeStepRun,
  OrchRun,
  NodeRunStatus,
} from '../models/orchestrator.model';
import { CiProviderService } from './ci-provider.service';
import { CiProviderType } from '../interfaces/ci-provider.interface';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';
import { OrchestratorService } from './orchestrator.service';
import { NotificationService } from './notification.service';
import { GenericSourceService } from './generic-source.service';
import { GenericSource } from '../models/generic-source.model';

const TERMINAL_STATUSES = new Set<NodeRunStatus>(['success', 'failure', 'skipped']);

@Injectable({ providedIn: 'root' })
export class OrchestratorExecutorService {
  private readonly ci = inject(CiProviderService);
  private readonly settings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);
  private readonly orchSvc = inject(OrchestratorService);
  private readonly notif = inject(NotificationService);
  private readonly translate = inject(TranslateService);
  private readonly genericSvc = inject(GenericSourceService);

  readonly activeRun = signal<OrchRun | null>(null);
  private stopRequested = false;

  stop(): void {
    this.stopRequested = true;
  }

  async execute(graph: OrchGraph, chains: Chain[]): Promise<void> {
    this.stopRequested = false;
    this.audit.log('Graph run started', graph.name);
    const chainMap = new Map(chains.map((c) => [c.id, c]));
    const startNode = graph.nodes.find((n) => n.type === 'start');
    if (!startNode) return;

    const run: OrchRun = {
      id: crypto.randomUUID(),
      graphId: graph.id,
      graphName: graph.name,
      startedAt: new Date().toISOString(),
      status: 'running',
      nodes: graph.nodes
        .filter((n) => n.type !== 'start')
        .map((n) => ({ nodeId: n.id, status: 'idle' })),
    };
    this.push(run);

    const promises = new Map<string, Promise<boolean>>();
    promises.set(startNode.id, Promise.resolve(true));

    const reachableIds = this.reachable(graph, startNode.id);
    await Promise.all(
      reachableIds
        .filter((id) => id !== startNode.id)
        .map((id) => this.buildNodePromise(id, graph, chainMap, run, promises)),
    );

    // Mark any unreached idle nodes as skipped
    run.nodes
      .filter((n) => n.status === 'idle')
      .forEach((n) => {
        n.status = 'skipped';
      });
    run.status = run.nodes.some((n) => n.status === 'failure') ? 'failure' : 'success';
    this.push(run);
    this.audit.log(`Graph run ${run.status}`, graph.name);
    this.orchSvc.saveRun({ ...run, nodes: run.nodes.map((n) => ({ ...n })) });

    // Browser notification for graph completion
    const t = this.translate;
    if (run.status === 'success') {
      this.notif.show(`✓ ${graph.name}`, t.instant('notif.graphOk'));
    } else {
      const failedNode = run.nodes.find((n) => n.status === 'failure');
      const failLabel = failedNode
        ? (graph.nodes.find((n) => n.id === failedNode.nodeId)?.label ?? '')
        : '';
      this.notif.show(`✕ ${graph.name}`, failLabel || t.instant('notif.graphFail'));
    }
  }

  private buildNodePromise(
    nodeId: string,
    graph: OrchGraph,
    chainMap: Map<string, Chain>,
    run: OrchRun,
    promises: Map<string, Promise<boolean>>,
  ): Promise<boolean> {
    const cached = promises.get(nodeId);
    if (cached !== undefined) return cached;
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return Promise.resolve(false);
    const predIds = graph.edges.filter((e) => e.toId === nodeId).map((e) => e.fromId);

    const p = Promise.all(
      predIds.map((id) => this.buildNodePromise(id, graph, chainMap, run, promises)),
    ).then((results) => this.executeNodeAfterDeps(results, nodeId, node, chainMap, run));

    promises.set(nodeId, p);
    return p;
  }

  private async executeNodeAfterDeps(
    results: boolean[],
    nodeId: string,
    node: OrchNode,
    chainMap: Map<string, Chain>,
    run: OrchRun,
  ): Promise<boolean> {
    const nr = run.nodes.find((n) => n.nodeId === nodeId);
    if (!nr) return false;

    if (this.stopRequested || results.some((r) => !r)) {
      this.setStatus(run, nr, 'skipped');
      return false;
    }

    if (node.disabled) {
      this.setStatus(run, nr, 'skipped');
      return true; // pass-through so downstream nodes still run
    }

    if (node.type === 'integration') {
      const source = this.genericSvc.sources().find((s) => s.id === node.sourceId);
      if (!source) {
        nr.error = 'Integration source not found';
        this.setStatus(run, nr, 'failure');
        return false;
      }
      return this.executeIntegrationNode(source, node, nr, run);
    }

    const chain = chainMap.get(node.chainId ?? '');
    if (!chain) {
      nr.error = 'Chain not found';
      this.setStatus(run, nr, 'failure');
      return false;
    }

    return this.executeChainNode(node, chain, nr, run);
  }

  private async executeIntegrationNode(
    source: GenericSource,
    node: OrchNode,
    nr: OrchNodeRun,
    run: OrchRun,
  ): Promise<boolean> {
    this.setStatus(run, nr, 'running');
    this.audit.log(`Graph step 1/1 started`, `${source.name} (${source.url})`);
    const intResult = await this.pollIntegration(source);
    if (!intResult.ok && intResult.error) nr.error = intResult.error;
    const intStatus = intResult.ok ? 'success' : 'failure';
    this.setStatus(run, nr, intStatus);
    this.audit.log(
      `Graph step 1/1 ${intStatus}`,
      intResult.ok ? source.name : `${source.name} — ${intResult.error ?? 'failed'}`,
    );
    const t = this.translate;
    this.notif.show(
      `${intResult.ok ? '✓' : '✕'} ${node.label}`,
      intResult.ok ? t.instant('notif.nodeOk') : (intResult.error ?? t.instant('notif.nodeFail')),
    );
    return intResult.ok;
  }

  private async executeChainNode(
    node: OrchNode,
    chain: Chain,
    nr: OrchNodeRun,
    run: OrchRun,
  ): Promise<boolean> {
    const effectiveChain = node.disabledSteps?.length
      ? { ...chain, steps: chain.steps.filter((s) => !node.disabledSteps?.includes(s.id)) }
      : chain;
    this.setStatus(run, nr, 'running');
    const result = await this.runChain(effectiveChain, nr, run);
    if (!result.ok && result.error) nr.error = result.error;
    const nodeStatus = result.ok ? 'success' : 'failure';
    this.setStatus(run, nr, nodeStatus);
    const t = this.translate;
    this.notif.show(
      `${result.ok ? '✓' : '✕'} ${node.label}`,
      result.ok ? t.instant('notif.nodeOk') : (result.error ?? t.instant('notif.nodeFail')),
    );
    return result.ok;
  }

  private setStatus(run: OrchRun, nr: OrchNodeRun, status: NodeRunStatus): void {
    nr.status = status;
    if (status === 'running') nr.startedAt = new Date().toISOString();
    if (TERMINAL_STATUSES.has(status)) nr.completedAt = new Date().toISOString();
    this.push(run);
  }

  private push(run: OrchRun): void {
    this.activeRun.set({ ...run, nodes: run.nodes.map((n) => ({ ...n })) });
  }

  private reachable(graph: OrchGraph, startId: string): string[] {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length) {
      const id = queue.shift();
      if (id === undefined || visited.has(id)) continue;
      visited.add(id);
      graph.edges.filter((e) => e.fromId === id).forEach((e) => queue.push(e.toId));
    }
    return [...visited];
  }

  // ── Chain execution ─────────────────────────────────────────────────────────

  private async runChain(
    chain: Chain,
    nr: OrchNodeRun,
    run: OrchRun,
  ): Promise<{ ok: boolean; error?: string }> {
    nr.steps = chain.steps.map(
      (s): OrchNodeStepRun => ({
        stepName: s.workflowName,
        repoFullName: s.repoFullName,
        status: 'pending',
      }),
    );
    this.push(run);

    for (let i = 0; i < chain.steps.length; i++) {
      const result = await this.runSingleStep(chain, i, nr, run);
      if (!result.continue) return { ok: false, error: result.error };
    }

    return { ok: true };
  }

  private async runSingleStep(
    chain: Chain,
    i: number,
    nr: OrchNodeRun,
    run: OrchRun,
  ): Promise<{ continue: boolean; error?: string }> {
    const step = chain.steps[i];
    const stepRun = nr.steps![i];
    const total = chain.steps.length;

    if (this.stopRequested) {
      this.skipFromIndex(nr, i, total, run);
      return { continue: false, error: 'Stopped' };
    }

    const provider: CiProviderType = step.provider ?? 'github';
    stepRun.status = 'running';
    this.push(run);
    this.audit.log(
      `Graph step ${i + 1}/${total} started`,
      `${step.workflowName} (${step.repoFullName})`,
    );

    if (step.clearCache && provider === 'github') {
      await this.clearCache(step.repoFullName, step.ref);
    }

    const ref = await this.resolveRef(step, provider);

    const triggerTime = Date.now();
    const { err, gitlabPipelineId } = await this.triggerStep(
      step.repoFullName,
      step.workflowId ?? 0,
      ref,
      step.inputs,
      provider,
    );

    if (err !== null) {
      stepRun.status = 'failure';
      stepRun.error = err;
      this.skipFromIndex(nr, i + 1, total, run);
      this.audit.log(`Graph step ${i + 1}/${total} failure`, `${step.workflowName}: ${err}`);
      return { continue: false, error: `${step.workflowName}: ${err}` };
    }

    const stepResult = await this.waitForStep(
      step.repoFullName,
      step.workflowId ?? 0,
      triggerTime,
      provider,
      gitlabPipelineId,
    );

    stepRun.status = stepResult.ok ? 'success' : 'failure';
    if (!stepResult.ok) stepRun.error = stepResult.reason;
    this.push(run);

    const label = `${step.workflowName} (${step.repoFullName})`;
    this.audit.log(
      `Graph step ${i + 1}/${total} ${stepRun.status}`,
      stepResult.ok ? label : `${label} — ${stepResult.reason ?? 'failed'}`,
    );

    if (!stepResult.ok) {
      this.skipFromIndex(nr, i + 1, total, run);
      return { continue: false, error: `${step.workflowName}: ${stepResult.reason ?? 'failed'}` };
    }

    return { continue: true };
  }

  private skipFromIndex(nr: OrchNodeRun, from: number, total: number, run: OrchRun): void {
    for (let j = from; j < total; j++) {
      if (nr.steps) nr.steps[j].status = 'skipped';
    }
    this.push(run);
  }

  private async resolveRef(step: ChainStep, provider: CiProviderType): Promise<string> {
    if (!step.useLatestTag) return step.ref;
    const tag = await this.fetchLatestTag(step.repoFullName, provider);
    return tag ?? step.ref;
  }

  // ── Integration polling ─────────────────────────────────────────────────────

  private async pollIntegration(source: GenericSource): Promise<{ ok: boolean; error?: string }> {
    const maxPolls = this.settings.maxPolls();
    const interval = this.settings.pollIntervalSec() * 1000;
    await new Promise<void>((r) => setTimeout(r, 2000));

    for (let polls = 0; polls <= maxPolls; polls++) {
      if (this.stopRequested) return { ok: false, error: 'Stopped' };
      try {
        const result = await firstValueFrom(this.genericSvc.testFetch(source));
        if (result.status === 'success') return { ok: true };
        if (result.status === 'failure' || result.status === 'error') {
          return { ok: false, error: result.rawStatus ?? 'failed' };
        }
        // 'running' | 'unknown' → keep polling
      } catch {
        /* transient network error — retry */
      }
      await new Promise<void>((r) => setTimeout(r, interval));
    }
    return { ok: false, error: 'Timed out' };
  }

  private fetchLatestTag(fullName: string, provider: CiProviderType): Promise<string | null> {
    return new Promise((resolve) =>
      this.ci
        .getLatestTag(fullName, provider)
        .subscribe({ next: (tag) => resolve(tag), error: () => resolve(null) }),
    );
  }

  private clearCache(fullName: string, ref: string): Promise<void> {
    return this.ci.deleteRepoCaches(fullName, ref);
  }

  private triggerStep(
    fullName: string,
    workflowId: number,
    ref: string,
    inputs: Record<string, string>,
    provider: CiProviderType,
  ): Promise<{ err: string | null; gitlabPipelineId?: number }> {
    return new Promise((resolve) =>
      this.ci.triggerWorkflow(fullName, workflowId, ref, inputs, provider).subscribe({
        next: (result) => resolve({ err: null, gitlabPipelineId: result.gitlabPipelineId }),
        error: (e) => resolve({ err: e?.error?.message ?? e?.message ?? 'Failed to trigger' }),
      }),
    );
  }

  private async waitForStep(
    fullName: string,
    workflowId: number,
    since: number,
    provider: CiProviderType,
    gitlabPipelineId?: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    const maxPolls = this.settings.maxPolls();
    const interval = this.settings.pollIntervalSec() * 1000;
    await new Promise<void>((r) => setTimeout(r, 4000));

    for (let polls = 0; polls <= maxPolls; polls++) {
      if (this.stopRequested) return { ok: false, reason: 'stopped' };
      try {
        const result = await this.pollStepOnce(
          fullName,
          workflowId,
          since,
          provider,
          gitlabPipelineId,
        );
        if (result.done) return { ok: result.ok ?? false, reason: result.reason };
      } catch {
        /* retry on transient network error */
      }
      await new Promise<void>((r) => setTimeout(r, interval));
    }

    return { ok: false, reason: 'timed out' };
  }

  private async pollStepOnce(
    fullName: string,
    workflowId: number,
    since: number,
    provider: CiProviderType,
    gitlabPipelineId?: number,
  ): Promise<{ done: boolean; ok?: boolean; reason?: string }> {
    if (provider === 'gitlab' && gitlabPipelineId !== undefined) {
      const run = await firstValueFrom(this.ci.pollGitLabPipeline(fullName, gitlabPipelineId));
      if (run.status === 'completed') {
        return run.conclusion === 'success'
          ? { done: true, ok: true }
          : { done: true, ok: false, reason: run.conclusion ?? 'failure' };
      }
    } else {
      const runs = await firstValueFrom(this.ci.pollGitHubRuns(fullName, workflowId));
      const run = runs.find((r) => new Date(r.created_at).getTime() >= since - 8000);
      if (run?.status === 'completed') {
        return run.conclusion === 'success'
          ? { done: true, ok: true }
          : { done: true, ok: false, reason: run.conclusion ?? 'failure' };
      }
    }
    return { done: false };
  }
}
