import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { GitHubApiService, GhRepo, GhRun, GhWorkflow } from '../../core/services/github-api.service';
import { RunStatusPipe } from '../../shared/pipes/run-status.pipe';

@Component({
  selector: 'app-github-actions',
  imports: [FormsModule, DatePipe, RunStatusPipe, TranslateModule],
  templateUrl: './github-actions.component.html',
  styleUrl: './github-actions.component.scss',
})
export class GithubActionsComponent implements OnInit {
  private gh = inject(GitHubApiService);

  repos           = signal<GhRepo[]>([]);
  repoSearch      = signal('');
  selectedRepo    = signal<GhRepo | null>(null);
  workflows       = signal<GhWorkflow[]>([]);
  runs            = signal<GhRun[]>([]);
  loading         = signal(true);
  runsLoading     = signal(false);
  error           = signal<string | null>(null);
  actionFeedback  = signal<{ id: number; msg: string } | null>(null);

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    if (!q) return this.repos();
    return this.repos().filter((r) =>
      r.name.toLowerCase().includes(q) || r.full_name.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    this.gh.listRepos().subscribe({
      next: (repos) => {
        this.repos.set(repos);
        this.loading.set(false);
        if (repos.length) this.selectRepo(repos[0]);
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  selectRepo(repo: GhRepo): void {
    this.selectedRepo.set(repo);
    this.runsLoading.set(true);
    this.runs.set([]);
    this.gh.listRuns(repo.full_name).subscribe({
      next: (res) => { this.runs.set(res.workflow_runs); this.runsLoading.set(false); },
      error: () => this.runsLoading.set(false),
    });
  }

  rerun(run: GhRun): void {
    this.gh.rerunWorkflow(this.selectedRepo()!.full_name, run.id).subscribe({
      next: () => this.showFeedback(run.id, 'Re-run triggered'),
      error: (e) => this.showFeedback(run.id, e?.error?.message ?? 'Error'),
    });
  }

  cancel(run: GhRun): void {
    this.gh.cancelRun(this.selectedRepo()!.full_name, run.id).subscribe({
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
