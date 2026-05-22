import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Chain } from '../models/chain.model';
import {
  OrchGraph,
  OrchNode,
  OrchNodeRun,
  OrchRun,
  NodeRunStatus,
} from '../models/orchestrator.model';
import { CiProviderService } from './ci-provider.service';
import { CiProviderType } from '../interfaces/ci-provider.interface';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';
import { OrchestratorService } from './orchestrator.service';

const TERMINAL_STATUSES = new Set<NodeRunStatus>(['success', 'failure', 'skipped']);

@Injectable({ providedIn: 'root' })
export class OrchestratorExecutorService {
  private readonly ci = inject(CiProviderService);
  private readonly settings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);
  private readonly orchSvc = inject(OrchestratorService);

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
        .map((n) => ({ nodeId: n.id, status: 'idle' as NodeRunStatus })),
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

    const chain = chainMap.get(node.chainId ?? '');
    if (!chain) {
      nr.error = 'Chain not found';
      this.setStatus(run, nr, 'failure');
      return false;
    }

    const effectiveChain = node.disabledSteps?.length
      ? { ...chain, steps: chain.steps.filter((s) => !node.disabledSteps?.includes(s.id)) }
      : chain;

    this.setStatus(run, nr, 'running');
    const result = await this.runChain(effectiveChain);
    if (!result.ok && result.error) nr.error = result.error;
    this.setStatus(run, nr, result.ok ? 'success' : 'failure');
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

  private async runChain(chain: Chain): Promise<{ ok: boolean; error?: string }> {
    for (const step of chain.steps) {
      if (this.stopRequested) return { ok: false, error: 'Stopped' };

      const provider: CiProviderType = step.provider ?? 'github';

      if (step.clearCache && provider === 'github') {
        await this.clearCache(step.repoFullName, step.ref);
      }

      let ref = step.ref;
      if (step.useLatestTag) {
        const tag = await this.fetchLatestTag(step.repoFullName, provider);
        if (tag) ref = tag;
      }

      const triggerTime = Date.now();
      const { err, gitlabPipelineId } = await this.triggerStep(
        step.repoFullName,
        step.workflowId ?? 0,
        ref,
        step.inputs,
        provider,
      );
      if (err !== null) return { ok: false, error: `${step.workflowName}: ${err}` };

      const stepResult = await this.waitForStep(
        step.repoFullName,
        step.workflowId ?? 0,
        triggerTime,
        provider,
        gitlabPipelineId,
      );
      if (!stepResult.ok)
        return { ok: false, error: `${step.workflowName}: ${stepResult.reason ?? 'failed'}` };
    }
    return { ok: true };
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
        if (provider === 'gitlab' && gitlabPipelineId !== undefined) {
          const run = await firstValueFrom(this.ci.pollGitLabPipeline(fullName, gitlabPipelineId));
          if (run.status === 'completed') {
            return run.conclusion === 'success'
              ? { ok: true }
              : { ok: false, reason: run.conclusion ?? 'failure' };
          }
        } else {
          const runs = await firstValueFrom(this.ci.pollGitHubRuns(fullName, workflowId));
          const run = runs.find((r) => new Date(r.created_at).getTime() >= since - 8000);
          if (run?.status === 'completed') {
            return run.conclusion === 'success'
              ? { ok: true }
              : { ok: false, reason: run.conclusion ?? 'failure' };
          }
        }
      } catch {
        /* retry on transient network error */
      }

      await new Promise<void>((r) => setTimeout(r, interval));
    }

    return { ok: false, reason: 'timed out' };
  }
}
