import { Injectable, inject, signal } from '@angular/core';
import { Chain, ChainRun, ChainStepRun, ChainRunStatus } from '../models/chain.model';
import { GitHubApiService } from './github-api.service';
import { ChainService } from './chain.service';
import { NotificationService } from './notification.service';
import { AppSettingsService } from './app-settings.service';
import { TranslateService } from '@ngx-translate/core';


@Injectable({ providedIn: 'root' })
export class ChainExecutorService {
  private gh       = inject(GitHubApiService);
  private chainSvc = inject(ChainService);
  private notif    = inject(NotificationService);
  private settings = inject(AppSettingsService);
  private translate= inject(TranslateService);

  readonly activeRun = signal<ChainRun | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private stopRequested = false;

  async execute(chain: Chain): Promise<void> {
    this.stopRequested = false;
    const run: ChainRun = {
      id: crypto.randomUUID(),
      chainId: chain.id,
      chainName: chain.name,
      startedAt: new Date().toISOString(),
      status: 'running',
      steps: chain.steps.map((s) => ({ stepId: s.id, status: 'pending' })),
    };
    this.activeRun.set({ ...run });
    this.chainSvc.saveRun(run);

    for (let i = 0; i < chain.steps.length; i++) {
      if (this.stopRequested) {
        run.status = 'stopped';
        run.steps[i].status = 'skipped';
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        break;
      }

      const step = chain.steps[i];
      run.steps[i].status = 'running';
      run.steps[i].startedAt = new Date().toISOString();
      this.push(run);

      if (step.clearCache) {
        await this.clearCache(step.repoFullName, step.ref);
      }

      const triggerTime = Date.now();
      const triggerError = await this.triggerStep(step.repoFullName, step.workflowId, step.ref, step.inputs);
      if (triggerError !== null) {
        run.steps[i].status = 'failure';
        run.steps[i].error = triggerError;
        run.steps[i].completedAt = new Date().toISOString();
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        run.status = 'failure';
        this.push(run);
        this.notifyStep(step.workflowName, i, chain.steps.length, 'failure', triggerError);
        break;
      }

      const result = await this.waitForRun(step.repoFullName, step.workflowId, triggerTime, run.steps[i]);
      run.steps[i].completedAt = new Date().toISOString();
      this.push(run);
      this.notifyStep(step.workflowName, i, chain.steps.length, result === 'success' ? 'success' : 'failure', run.steps[i].error);

      if (result !== 'success') {
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        run.status = result === 'stopped' ? 'stopped' : 'failure';
        break;
      }
    }

    if (run.status === 'running') run.status = 'success';
    this.push(run);
    this.chainSvc.saveRun(run);
    this.notify(chain.name, run);
  }

  private notify(chainName: string, run: ChainRun): void {
    try {
      const t = this.translate;
      if (run.status === 'success') {
        this.notif.show(`✓ ${chainName}`, t.instant('notif.chainOk'));
      } else if (run.status === 'failure') {
        const failed = run.steps.find(s => s.status === 'failure');
        this.notif.show(`✕ ${chainName}`, failed?.error ?? t.instant('notif.chainFail'));
      }
    } catch { /* notification errors must never affect chain state */ }
  }

  private notifyStep(stepName: string, index: number, total: number, status: 'success' | 'failure', error?: string): void {
    try {
      const t = this.translate;
      const icon  = status === 'success' ? '✓' : '✕';
      const title = `${icon} ${t.instant('notif.stepTitle', { n: index + 1, total, name: stepName })}`;
      const body  = status === 'success' ? t.instant('notif.stepOk') : (error ?? t.instant('notif.stepFail'));
      this.notif.show(title, body);
    } catch { /* notification errors must never affect chain state */ }
  }

  stop(): void {
    this.stopRequested = true;
  }

  private push(run: ChainRun): void {
    this.activeRun.set({ ...run, steps: run.steps.map((s) => ({ ...s })) });
    this.chainSvc.saveRun({ ...run, steps: run.steps.map((s) => ({ ...s })) });
  }

  private clearCache(fullName: string, ref: string): Promise<void> {
    return new Promise((resolve) => {
      this.gh.deleteRepoCaches(fullName, ref).subscribe({ next: () => resolve(), error: () => resolve() });
    });
  }

  private triggerStep(fullName: string, workflowId: number, ref: string, inputs: Record<string, string>): Promise<string | null> {
    return new Promise((resolve) => {
      this.gh.triggerWorkflow(fullName, workflowId, ref, inputs).subscribe({
        next: () => resolve(null),
        error: (e) => {
          const msg: string = e?.error?.message ?? e?.message ?? 'Failed to trigger workflow';
          resolve(msg);
        },
      });
    });
  }

  private waitForRun(
    fullName: string,
    workflowId: number,
    since: number,
    stepRun: ChainStepRun
  ): Promise<'success' | 'failure' | 'stopped'> {
    return new Promise((resolve) => {
      let polls = 0;
      const tick = () => {
        if (this.stopRequested) { resolve('stopped'); return; }
        const maxPolls     = this.settings.maxPolls();
        const pollInterval = this.settings.pollIntervalSec() * 1000;
        if (polls++ > maxPolls) { resolve('failure'); return; }

        this.gh.listRuns(fullName, workflowId).subscribe({
          next: (res) => {
            const run = res.workflow_runs.find(
              (r) => new Date(r.created_at).getTime() >= since - 8000
            );
            if (!run) { this.timer = setTimeout(tick, pollInterval) as any; return; }

            stepRun.runId  = run.id;
            stepRun.runUrl = run.html_url;

            if (run.status !== 'completed') {
              this.timer = setTimeout(tick, pollInterval) as any;
              return;
            }
            stepRun.status = run.conclusion === 'success' ? 'success' : 'failure';
            resolve(stepRun.status);
          },
          error: () => { this.timer = setTimeout(tick, pollInterval) as any; },
        });
      };
      this.timer = setTimeout(tick, 4000) as any; // small initial delay for GH to register the run
    });
  }
}
