import { Injectable, inject, signal } from '@angular/core';
import { Chain, ChainRun, ChainStepRun } from '../models/chain.model';
import { CiProviderService } from './ci-provider.service';
import { CiProviderType } from '../interfaces/ci-provider.interface';
import { ChainService } from './chain.service';
import { NotificationService } from './notification.service';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';
import { TranslateService } from '@ngx-translate/core';

type PollResult = 'success' | 'failure' | 'pending';
type StepOutcome = 'continue' | 'stopped' | 'failure';

@Injectable({ providedIn: 'root' })
export class ChainExecutorService {
  private readonly ci = inject(CiProviderService);
  private readonly chainSvc = inject(ChainService);
  private readonly notif = inject(NotificationService);
  private readonly settings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);
  private readonly translate = inject(TranslateService);

  readonly activeRuns = signal<Record<string, ChainRun>>({});
  private readonly stopRequested = new Set<string>();

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
      const outcome = await this.executeStep(chain, run, i);
      if (outcome !== 'continue') break;
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

  private async executeStep(chain: Chain, run: ChainRun, i: number): Promise<StepOutcome> {
    if (this.stopRequested.has(chain.id)) {
      run.status = 'stopped';
      this.skipRemaining(run.steps, i);
      return 'stopped';
    }

    const step = chain.steps[i];
    const provider = step.provider ?? 'github';
    run.steps[i].status = 'running';
    run.steps[i].startedAt = new Date().toISOString();
    this.push(run);

    if (step.clearCache && provider === 'github') {
      await this.ci.deleteRepoCaches(step.repoFullName, step.ref);
    }

    const ref = step.useLatestTag
      ? ((await this.fetchLatestTag(step.repoFullName, provider)) ?? step.ref)
      : step.ref;

    const triggerTime = Date.now();
    const { error, gitlabPipelineId } = await this.triggerStep(
      step.repoFullName,
      step.workflowId ?? 0,
      ref,
      step.inputs,
      provider,
    );

    if (error !== null) {
      run.steps[i].status = 'failure';
      run.steps[i].error = error;
      run.steps[i].completedAt = new Date().toISOString();
      this.skipRemaining(run.steps, i + 1);
      run.status = 'failure';
      this.push(run);
      this.notifyStep(step.workflowName, i, chain.steps.length, 'failure', error);
      return 'failure';
    }

    const pollResult = await this.waitForRun(
      step.repoFullName,
      step.workflowId ?? 0,
      triggerTime,
      run.steps[i],
      provider,
      gitlabPipelineId,
      chain.id,
    );
    run.steps[i].completedAt = new Date().toISOString();
    this.push(run);
    this.notifyStep(
      step.workflowName,
      i,
      chain.steps.length,
      pollResult === 'success' ? 'success' : 'failure',
      run.steps[i].error,
    );

    if (pollResult !== 'success') {
      this.skipRemaining(run.steps, i + 1);
      run.status = pollResult === 'stopped' ? 'stopped' : 'failure';
      return pollResult === 'stopped' ? 'stopped' : 'failure';
    }

    return 'continue';
  }

  private skipRemaining(steps: ChainStepRun[], fromIndex: number): void {
    for (let j = fromIndex; j < steps.length; j++) steps[j].status = 'skipped';
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
    const poll =
      provider === 'gitlab' && gitlabPipelineId !== undefined
        ? () => this.pollGitLab(fullName, gitlabPipelineId, stepRun)
        : () => this.pollGitHub(fullName, workflowId, since, stepRun);

    return new Promise((resolve) => {
      let polls = 0;
      const tick = () => {
        if (chainId && this.stopRequested.has(chainId)) {
          resolve('stopped');
          return;
        }
        if (polls++ > this.settings.maxPolls()) {
          resolve('failure');
          return;
        }
        const interval = this.settings.pollIntervalSec() * 1000;
        poll().then((result) => {
          if (result === 'pending') setTimeout(tick, interval);
          else resolve(result);
        });
      };
      setTimeout(tick, 4000);
    });
  }

  private pollGitLab(
    fullName: string,
    pipelineId: number,
    stepRun: ChainStepRun,
  ): Promise<PollResult> {
    return new Promise((resolve) => {
      this.ci.pollGitLabPipeline(fullName, pipelineId).subscribe({
        next: (run) => {
          stepRun.runId = run.id;
          stepRun.runUrl = run.html_url;
          if (run.status !== 'completed') {
            resolve('pending');
            return;
          }
          stepRun.status = run.conclusion === 'success' ? 'success' : 'failure';
          resolve(stepRun.status);
        },
        error: () => resolve('pending'),
      });
    });
  }

  private pollGitHub(
    fullName: string,
    workflowId: number,
    since: number,
    stepRun: ChainStepRun,
  ): Promise<PollResult> {
    return new Promise((resolve) => {
      this.ci.pollGitHubRuns(fullName, workflowId).subscribe({
        next: (runs) => {
          const run = runs.find((r) => new Date(r.created_at).getTime() >= since - 8000);
          if (run?.status !== 'completed') {
            resolve('pending');
            return;
          }
          stepRun.runId = run.id;
          stepRun.runUrl = run.html_url;
          stepRun.status = run.conclusion === 'success' ? 'success' : 'failure';
          resolve(stepRun.status);
        },
        error: () => resolve('pending'),
      });
    });
  }
}
