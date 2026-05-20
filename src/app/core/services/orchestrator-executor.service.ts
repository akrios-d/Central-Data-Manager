import { Injectable, inject, signal } from '@angular/core';
import { Chain } from '../models/chain.model';
import { OrchGraph, OrchNodeRun, OrchRun, NodeRunStatus } from '../models/orchestrator.model';
import { GitHubApiService } from './github-api.service';
import { AppSettingsService } from './app-settings.service';
import { OrchestratorService } from './orchestrator.service';

@Injectable({ providedIn: 'root' })
export class OrchestratorExecutorService {
  private gh = inject(GitHubApiService);
  private settings = inject(AppSettingsService);
  private orchSvc = inject(OrchestratorService);

  readonly activeRun = signal<OrchRun | null>(null);
  private stopRequested = false;

  stop(): void {
    this.stopRequested = true;
  }

  async execute(graph: OrchGraph, chains: Chain[]): Promise<void> {
    this.stopRequested = false;
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

    const getPromise = (nodeId: string): Promise<boolean> => {
      const cached = promises.get(nodeId);
      if (cached !== undefined) return cached;
      const node = graph.nodes.find((n) => n.id === nodeId);
      if (!node) return Promise.resolve(false);
      const predIds = graph.edges.filter((e) => e.toId === nodeId).map((e) => e.fromId);

      const p = Promise.all(predIds.map((id) => getPromise(id))).then(async (results) => {
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

        const chain = chainMap.get(node.chainId!);
        if (!chain) {
          nr.error = 'Chain not found';
          this.setStatus(run, nr, 'failure');
          return false;
        }

        this.setStatus(run, nr, 'running');
        const result = await this.runChain(chain);
        if (!result.ok && result.error) nr.error = result.error;
        this.setStatus(run, nr, result.ok ? 'success' : 'failure');
        return result.ok;
      });

      promises.set(nodeId, p);
      return p;
    };

    const reachableIds = this.reachable(graph, startNode.id);
    await Promise.all(reachableIds.filter((id) => id !== startNode.id).map((id) => getPromise(id)));

    // Mark any unreached idle nodes as skipped
    run.nodes
      .filter((n) => n.status === 'idle')
      .forEach((n) => {
        n.status = 'skipped';
      });
    run.status = run.nodes.some((n) => n.status === 'failure') ? 'failure' : 'success';
    this.push(run);
    this.orchSvc.saveRun({ ...run, nodes: run.nodes.map((n) => ({ ...n })) });
  }

  private setStatus(run: OrchRun, nr: OrchNodeRun, status: NodeRunStatus): void {
    nr.status = status;
    if (status === 'running') nr.startedAt = new Date().toISOString();
    if (['success', 'failure', 'skipped'].includes(status))
      nr.completedAt = new Date().toISOString();
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

  private async runChain(chain: Chain): Promise<{ ok: boolean; error?: string }> {
    for (const step of chain.steps) {
      if (this.stopRequested) return { ok: false, error: 'Stopped' };
      if (step.clearCache) await this.clearCache(step.repoFullName, step.ref);

      let ref = step.ref;
      if (step.useLatestTag) {
        const tag = await this.fetchLatestTag(step.repoFullName);
        if (tag) ref = tag;
      }

      const err = await this.triggerStep(step.repoFullName, step.workflowId ?? 0, ref, step.inputs);
      if (err !== null) return { ok: false, error: `${step.workflowName}: ${err}` };

      const stepResult = await this.waitForStep(
        step.repoFullName,
        step.workflowId ?? 0,
        Date.now(),
      );
      if (!stepResult.ok)
        return { ok: false, error: `${step.workflowName}: ${stepResult.reason ?? 'failed'}` };
    }
    return { ok: true };
  }

  private fetchLatestTag(fullName: string): Promise<string | null> {
    return new Promise((resolve) =>
      this.gh
        .listTags(fullName)
        .subscribe({ next: (ts) => resolve(ts[0]?.name ?? null), error: () => resolve(null) }),
    );
  }

  private clearCache(fullName: string, ref: string): Promise<void> {
    return new Promise((resolve) =>
      this.gh
        .deleteRepoCaches(fullName, ref)
        .subscribe({ next: () => resolve(), error: () => resolve() }),
    );
  }

  private triggerStep(
    fullName: string,
    workflowId: number,
    ref: string,
    inputs: Record<string, string>,
  ): Promise<string | null> {
    return new Promise((resolve) =>
      this.gh.triggerWorkflow(fullName, workflowId, ref, inputs).subscribe({
        next: () => resolve(null),
        error: (e) => resolve(e?.error?.message ?? e?.message ?? 'Failed to trigger'),
      }),
    );
  }

  private waitForStep(
    fullName: string,
    workflowId: number,
    since: number,
  ): Promise<{ ok: boolean; reason?: string }> {
    return new Promise((resolve) => {
      let polls = 0;
      const tick = () => {
        if (this.stopRequested) {
          resolve({ ok: false, reason: 'stopped' });
          return;
        }
        const maxPolls = this.settings.maxPolls();
        const interval = this.settings.pollIntervalSec() * 1000;
        if (polls++ > maxPolls) {
          resolve({ ok: false, reason: 'timed out' });
          return;
        }
        this.gh.listRuns(fullName, workflowId).subscribe({
          next: (res) => {
            const run = res.workflow_runs.find(
              (r) => new Date(r.created_at).getTime() >= since - 8000,
            );
            if (run?.status !== 'completed') {
              setTimeout(tick, interval);
              return;
            }
            resolve(
              run.conclusion === 'success'
                ? { ok: true }
                : { ok: false, reason: run.conclusion ?? 'failure' },
            );
          },
          error: () => setTimeout(tick, interval),
        });
      };
      setTimeout(tick, 4000);
    });
  }
}
