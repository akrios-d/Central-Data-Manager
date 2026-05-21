import { Injectable, inject, signal } from '@angular/core';
import { Chain, ChainRun, ChainStepRun } from '../models/chain.model';
import { CiProviderService } from './ci-provider.service';
import { CiProviderType } from '../interfaces/ci-provider.interface';
import { ChainService } from './chain.service';
import { NotificationService } from './notification.service';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';
import { TranslateService } from '@ngx-translate/core';

@Injectable({ providedIn: 'root' })
export class ChainExecutorService {
  private readonly ci = inject(CiProviderService);
  private readonly chainSvc = inject(ChainService);
  private readonly notif = inject(NotificationService);
  private readonly settings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);
  private readonly translate = inject(TranslateService);

  readonly activeRuns = signal<Record<string, ChainRun>>({});
  private stopRequested = new Set<string>();

  async execute(chain: Chain): Promise<void> {
    this.stopRequested.delete(chain.id);
    this.audit.log('Chain run started', chain.name);
    const run: ChainRun = {
      id: crypto.randomUUID(),
      chainId: chain.id,
      chainName: chain.name,
      startedAt: new Date().toISOString(),
      status: 'running',
      steps: chain.steps.map((s) => ({ stepId: s.id, status: 'pending' })),
    };
    this.push(run);

    for (let i = 0; i < chain.steps.length; i++) {
      if (this.stopRequested.has(chain.id)) {
        run.status = 'stopped';
        run.steps[i].status = 'skipped';
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        break;
      }

      const step = chain.steps[i];
      const provider = step.provider ?? 'github';
      run.steps[i].status = 'running';
      run.steps[i].startedAt = new Date().toISOString();
      this.push(run);

      if (step.clearCache && provider === 'github') {
        await this.ci.deleteRepoCaches(step.repoFullName, step.ref);
      }

      let ref = step.ref;
      if (step.useLatestTag) {
        const tag = await this.fetchLatestTag(step.repoFullName, provider);
        if (tag) ref = tag;
      }

      const triggerTime = Date.now();
      const triggerResult = await this.triggerStep(
        step.repoFullName,
        step.workflowId ?? 0,
        ref,
        step.inputs,
        provider,
      );

      if (triggerResult.error !== null) {
        run.steps[i].status = 'failure';
        run.steps[i].error = triggerResult.error;
        run.steps[i].completedAt = new Date().toISOString();
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        run.status = 'failure';
        this.push(run);
        this.notifyStep(step.workflowName, i, chain.steps.length, 'failure', triggerResult.error);
        break;
      }

      const result = await this.waitForRun(
        step.repoFullName,
        step.workflowId ?? 0,
        triggerTime,
        run.steps[i],
        provider,
        triggerResult.gitlabPipelineId,
        chain.id,
      );
      run.steps[i].completedAt = new Date().toISOString();
      this.push(run);
      this.notifyStep(
        step.workflowName,
        i,
        chain.steps.length,
        result === 'success' ? 'success' : 'failure',
        run.steps[i].error,
      );

      if (result !== 'success') {
        for (let j = i + 1; j < run.steps.length; j++) run.steps[j].status = 'skipped';
        run.status = result === 'stopped' ? 'stopped' : 'failure';
        break;
      }
    }

    if (run.status === 'running') run.status = 'success';
    this.push(run);
    this.chainSvc.saveRun(run);
    this.audit.log(`Chain run ${run.status}`, chain.name);
    this.notify(chain.name, run);
  }

  stop(chainId: string): void {
    this.stopRequested.add(chainId);
  }

  private push(run: ChainRun): void {
    const snapshot = { ...run, steps: run.steps.map((s) => ({ ...s })) };
    this.activeRuns.update((map) => ({ ...map, [run.chainId]: snapshot }));
    this.chainSvc.saveRun(snapshot);
  }

  private notify(chainName: string, run: ChainRun): void {
    try {
      const t = this.translate;
      if (run.status === 'success') {
        this.notif.show(`✓ ${chainName}`, t.instant('notif.chainOk'));
      } else if (run.status === 'failure') {
        const failed = run.steps.find((s) => s.status === 'failure');
        this.notif.show(`✕ ${chainName}`, failed?.error ?? t.instant('notif.chainFail'));
      }
    } catch {
      /* notification errors must never affect chain state */
    }
  }

  private notifyStep(
    stepName: string,
    index: number,
    total: number,
    status: 'success' | 'failure',
    error?: string,
  ): void {
    try {
      const t = this.translate;
      const icon = status === 'success' ? '✓' : '✕';
      const title = `${icon} ${t.instant('notif.stepTitle', { n: index + 1, total, name: stepName })}`;
      const body =
        status === 'success' ? t.instant('notif.stepOk') : (error ?? t.instant('notif.stepFail'));
      this.notif.show(title, body);
    } catch {
      /* notification errors must never affect chain state */
    }
  }

  private fetchLatestTag(fullName: string, provider: CiProviderType): Promise<string | null> {
    return new Promise((resolve) => {
      this.ci.getLatestTag(fullName, provider).subscribe({
        next: (tag) => resolve(tag),
        error: () => resolve(null),
      });
    });
  }

  private triggerStep(
    fullName: string,
    workflowId: number,
    ref: string,
    inputs: Record<string, string>,
    provider: CiProviderType,
  ): Promise<{ error: string | null; gitlabPipelineId?: number }> {
    return new Promise((resolve) => {
      this.ci.triggerWorkflow(fullName, workflowId, ref, inputs, provider).subscribe({
        next: (result) => resolve({ error: null, gitlabPipelineId: result.gitlabPipelineId }),
        error: (e) =>
          resolve({
            error: e?.error?.message ?? e?.message ?? 'Failed to trigger',
            gitlabPipelineId: undefined,
          }),
      });
    });
  }

  private waitForRun(
    fullName: string,
    workflowId: number,
    since: number,
    stepRun: ChainStepRun,
    provider: CiProviderType,
    gitlabPipelineId?: number,
    chainId?: string,
  ): Promise<'success' | 'failure' | 'stopped'> {
    return new Promise((resolve) => {
      let polls = 0;
      const tick = () => {
        if (chainId && this.stopRequested.has(chainId)) {
          resolve('stopped');
          return;
        }
        const maxPolls = this.settings.maxPolls();
        const pollInterval = this.settings.pollIntervalSec() * 1000;
        if (polls++ > maxPolls) {
          resolve('failure');
          return;
        }

        if (provider === 'gitlab' && gitlabPipelineId !== undefined) {
          this.ci.pollGitLabPipeline(fullName, gitlabPipelineId).subscribe({
            next: (run) => {
              stepRun.runId = run.id;
              stepRun.runUrl = run.html_url;
              if (run.status !== 'completed') {
                setTimeout(tick, pollInterval);
                return;
              }
              stepRun.status = run.conclusion === 'success' ? 'success' : 'failure';
              resolve(stepRun.status);
            },
            error: () => {
              setTimeout(tick, pollInterval);
            },
          });
        } else {
          this.ci.pollGitHubRuns(fullName, workflowId).subscribe({
            next: (runs) => {
              const run = runs.find((r) => new Date(r.created_at).getTime() >= since - 8000);
              if (!run) {
                setTimeout(tick, pollInterval);
                return;
              }
              stepRun.runId = run.id;
              stepRun.runUrl = run.html_url;
              if (run.status !== 'completed') {
                setTimeout(tick, pollInterval);
                return;
              }
              stepRun.status = run.conclusion === 'success' ? 'success' : 'failure';
              resolve(stepRun.status);
            },
            error: () => {
              setTimeout(tick, pollInterval);
            },
          });
        }
      };
      setTimeout(tick, 4000);
    });
  }
}
