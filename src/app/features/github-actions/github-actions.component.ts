import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { GitHubApiService, GhRepo, GhRun, GhWorkflow } from '../../core/services/github-api.service';
import { RunStatusPipe } from '../../shared/pipes/run-status.pipe';

@Component({
  selector: 'app-github-actions',
  imports: [FormsModule, DatePipe, RunStatusPipe],
  templateUrl: './github-actions.component.html',
  styleUrl: './github-actions.component.scss',
})
export class GithubActionsComponent implements OnInit {
  private gh = inject(GitHubApiService);

  repos = signal<GhRepo[]>([]);
  selectedRepo = signal<string | null>(null);
  workflows = signal<GhWorkflow[]>([]);
  runs = signal<GhRun[]>([]);
  loading = signal(true);
  runsLoading = signal(false);
  error = signal<string | null>(null);
  actionFeedback = signal<{ id: number; msg: string } | null>(null);

  ngOnInit(): void {
    this.gh.listRepos().subscribe({
      next: (repos) => {
        this.repos.set(repos);
        this.loading.set(false);
        if (repos.length) this.selectRepo(repos[0].name);
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  selectRepo(name: string): void {
    this.selectedRepo.set(name);
    this.runsLoading.set(true);
    this.runs.set([]);
    this.gh.listRuns(name).subscribe({
      next: (res) => { this.runs.set(res.workflow_runs); this.runsLoading.set(false); },
      error: () => this.runsLoading.set(false),
    });
  }

  rerun(run: GhRun): void {
    const repo = this.selectedRepo()!;
    this.gh.rerunWorkflow(repo, run.id).subscribe({
      next: () => this.showFeedback(run.id, 'Re-run triggered'),
      error: (e) => this.showFeedback(run.id, e?.error?.message ?? 'Error'),
    });
  }

  cancel(run: GhRun): void {
    const repo = this.selectedRepo()!;
    this.gh.cancelRun(repo, run.id).subscribe({
      next: () => this.showFeedback(run.id, 'Cancelled'),
      error: (e) => this.showFeedback(run.id, e?.error?.message ?? 'Error'),
    });
  }

  runClass(run: GhRun): string {
    return run.status !== 'completed' ? run.status : (run.conclusion ?? 'unknown');
  }

  private showFeedback(id: number, msg: string): void {
    this.actionFeedback.set({ id, msg });
    setTimeout(() => this.actionFeedback.set(null), 3000);
  }
}
