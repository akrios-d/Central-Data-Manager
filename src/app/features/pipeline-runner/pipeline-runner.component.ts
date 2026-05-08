import { Component, inject, signal, computed, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { GitHubApiService, GhRepo, GhWorkflow, GhRun } from '../../core/services/github-api.service';
import { RunStatusPipe } from '../../shared/pipes/run-status.pipe';
import { ToastService } from '../../shared/services/toast.service';

interface InputPair { key: string; value: string; }

@Component({
  selector: 'app-pipeline-runner',
  imports: [FormsModule, DatePipe, RunStatusPipe, TranslateModule],
  templateUrl: './pipeline-runner.component.html',
  styleUrl: './pipeline-runner.component.scss',
})
export class PipelineRunnerComponent implements OnDestroy {
  private gh     = inject(GitHubApiService);
  private toasts = inject(ToastService);

  // ── State ────────────────────────────────────────────────────────────────────
  repos          = signal<GhRepo[]>([]);
  repoSearch     = signal('');
  selectedRepo   = signal<GhRepo | null>(null);
  workflows      = signal<GhWorkflow[]>([]);
  selectedWf     = signal<GhWorkflow | null>(null);
  ref            = signal('main');
  inputs         = signal<InputPair[]>([{ key: '', value: '' }]);

  reposLoading   = signal(false);
  wfLoading      = signal(false);
  triggering     = signal(false);

  trackedRuns    = signal<GhRun[]>([]);
  polling        = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    return q ? this.repos().filter(r => r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q))
             : this.repos();
  });

  readonly validInputs = computed(() =>
    this.inputs().filter(p => p.key.trim()).reduce((acc, p) => ({ ...acc, [p.key.trim()]: p.value }), {} as Record<string, string>)
  );

  readonly canTrigger = computed(() =>
    !!this.selectedRepo() && !!this.selectedWf() && !!this.ref().trim() && !this.triggering()
  );

  // ── Load repos ───────────────────────────────────────────────────────────────
  loadRepos(): void {
    if (this.repos().length) return;
    this.reposLoading.set(true);
    this.gh.listRepos().subscribe({
      next: (r) => { this.repos.set(r); this.reposLoading.set(false); },
      error: ()  => this.reposLoading.set(false),
    });
  }

  selectRepo(repo: GhRepo): void {
    this.selectedRepo.set(repo);
    this.selectedWf.set(null);
    this.workflows.set([]);
    this.wfLoading.set(true);
    this.gh.listWorkflows(repo.full_name).subscribe({
      next: (res) => { this.workflows.set(res.workflows); this.wfLoading.set(false); },
      error: ()   => this.wfLoading.set(false),
    });
  }

  // ── Inputs ───────────────────────────────────────────────────────────────────
  addInput(): void   { this.inputs.update(list => [...list, { key: '', value: '' }]); }
  removeInput(i: number): void { this.inputs.update(list => list.filter((_, idx) => idx !== i)); }

  // ── Trigger ──────────────────────────────────────────────────────────────────
  trigger(): void {
    const repo = this.selectedRepo()!;
    const wf   = this.selectedWf()!;
    this.triggering.set(true);
    const triggerTime = Date.now();

    this.gh.triggerWorkflow(repo.full_name, wf.id, this.ref().trim(), this.validInputs()).subscribe({
      next: () => {
        this.triggering.set(false);
        this.toasts.show(`Workflow "${wf.name}" triggered on ${this.ref()}`, 'success');
        this.startPolling(repo.full_name, triggerTime);
      },
      error: (e) => {
        this.triggering.set(false);
        this.toasts.show(e?.error?.message ?? 'Failed to trigger workflow', 'danger');
      },
    });
  }

  // ── Polling ──────────────────────────────────────────────────────────────────
  private startPolling(fullName: string, since: number): void {
    this.stopPolling();
    this.polling.set(true);
    let attempts = 0;

    const poll = () => {
      this.gh.listRuns(fullName).subscribe({
        next: (res) => {
          const newRuns = res.workflow_runs.filter(r => new Date(r.created_at).getTime() >= since - 5000);
          this.trackedRuns.set(newRuns);
          attempts++;
          const allDone = newRuns.length > 0 && newRuns.every(r => r.status === 'completed');
          if (allDone || attempts >= 60) this.stopPolling();
        },
      });
    };

    poll();
    this.pollTimer = setInterval(poll, 5000);
  }

  stopPolling(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null; }
    this.polling.set(false);
  }

  runClass(run: GhRun): string {
    return run.status !== 'completed' ? run.status : (run.conclusion ?? 'unknown');
  }

  ngOnDestroy(): void { this.stopPolling(); }
}
