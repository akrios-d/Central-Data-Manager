import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { CiProviderService } from '../../core/services/ci-provider.service';
import { CiRepo, CiRun } from '../../core/interfaces/ci-provider.interface';
import { RunStatusPipe } from '../../shared/pipes/run-status.pipe';
import { firstValueFrom } from 'rxjs';

interface WorkflowStat {
  id: number;
  name: string;
  successRate: number;
  avgDuration: number;
  lastConclusion: string | null;
  recentRuns: CiRun[];
  totalRuns: number;
}

@Component({
  selector: 'app-github-actions',
  imports: [FormsModule, DatePipe, RunStatusPipe, TranslateModule],
  templateUrl: './github-actions.component.html',
  styleUrl:    './github-actions.component.scss',
})
export class GithubActionsComponent implements OnInit {
  private ci = inject(CiProviderService);

  // ── Shared ────────────────────────────────────────────────────────────────
  repos        = signal<CiRepo[]>([]);
  repoSearch   = signal('');
  selectedRepo = signal<CiRepo | null>(null);
  loading      = signal(true);
  error        = signal<string | null>(null);

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    return q ? this.repos().filter(r => r.full_name.toLowerCase().includes(q)) : this.repos();
  });

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<'runs' | 'health'>('runs');

  // ── Runs tab ──────────────────────────────────────────────────────────────
  runs           = signal<CiRun[]>([]);
  runsLoading    = signal(false);
  actionFeedback = signal<{ id: number; msg: string } | null>(null);

  // ── Health tab ────────────────────────────────────────────────────────────
  stats        = signal<WorkflowStat[]>([]);
  statsLoading = signal(false);
  statsError   = signal('');

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.ci.listRepos().subscribe({
      next: (repos) => {
        this.repos.set(repos);
        this.loading.set(false);
        if (repos.length) this.selectRepo(repos[0]);
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  // ── Repo selection ────────────────────────────────────────────────────────
  selectRepo(repo: CiRepo): void {
    this.selectedRepo.set(repo);
    this.runs.set([]);
    this.stats.set([]);
    this.statsError.set('');
    this.loadRuns(repo);
    if (this.activeTab() === 'health') this.loadHealth(repo);
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  switchTab(tab: 'runs' | 'health'): void {
    this.activeTab.set(tab);
    const repo = this.selectedRepo();
    if (tab === 'health' && repo && !this.stats().length && !this.statsLoading()) {
      this.loadHealth(repo);
    }
  }

  // ── Runs ──────────────────────────────────────────────────────────────────
  private loadRuns(repo: CiRepo): void {
    this.runsLoading.set(true);
    this.ci.listRuns(repo).subscribe({
      next: (res) => { this.runs.set(res.workflow_runs); this.runsLoading.set(false); },
      error: () => this.runsLoading.set(false),
    });
  }

  rerun(run: CiRun): void {
    this.ci.rerunRun(this.selectedRepo()!, run.id).subscribe({
      next: () => this.showFeedback(run.id, 'Re-run triggered'),
      error: (e) => this.showFeedback(run.id, e?.error?.message ?? 'Error'),
    });
  }

  cancel(run: CiRun): void {
    this.ci.cancelRun(this.selectedRepo()!, run.id).subscribe({
      next: () => this.showFeedback(run.id, 'Cancelled'),
      error: (e) => this.showFeedback(run.id, e?.error?.message ?? 'Error'),
    });
  }

  runClass(run: CiRun): string {
    return run.status !== 'completed' ? run.status : (run.conclusion ?? 'unknown');
  }

  private showFeedback(id: number, msg: string): void {
    this.actionFeedback.set({ id, msg });
    setTimeout(() => this.actionFeedback.set(null), 3000);
  }

  // ── Health ────────────────────────────────────────────────────────────────
  private async loadHealth(repo: CiRepo): Promise<void> {
    this.statsLoading.set(true);
    try {
      const res = await firstValueFrom(this.ci.listRunsForHealth(repo));
      this.stats.set(this.computeStats(res.workflow_runs ?? []));
    } catch (e: any) {
      this.statsError.set(e?.error?.message ?? 'Error loading runs');
    } finally {
      this.statsLoading.set(false);
    }
  }

  private computeStats(runs: CiRun[]): WorkflowStat[] {
    const byWorkflow = new Map<number, CiRun[]>();
    for (const r of runs) {
      if (!byWorkflow.has(r.workflow_id)) byWorkflow.set(r.workflow_id, []);
      byWorkflow.get(r.workflow_id)!.push(r);
    }
    return [...byWorkflow.entries()]
      .map(([id, wRuns]) => {
        const completed   = wRuns.filter(r => r.status === 'completed');
        const successes   = completed.filter(r => r.conclusion === 'success');
        const successRate = completed.length ? Math.round((successes.length / completed.length) * 100) : 0;
        const durations   = completed
          .map(r => new Date(r.updated_at).getTime() - new Date(r.run_started_at ?? r.created_at).getTime())
          .filter(d => d > 0 && d < 3_600_000);
        const avgDuration = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
        const sorted      = [...wRuns].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        return {
          id, successRate, avgDuration, totalRuns: wRuns.length,
          name:           sorted[0]?.name ?? `Workflow ${id}`,
          lastConclusion: sorted[0]?.conclusion ?? null,
          recentRuns:     sorted.slice(0, 10),
        } satisfies WorkflowStat;
      })
      .sort((a, b) => a.successRate - b.successRate);
  }

  formatDuration(ms: number): string {
    if (!ms) return '—';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  sparkDot(run: CiRun): string {
    return run.status === 'in_progress' ? '◌' : '●';
  }

  sparkClass(run: CiRun): string {
    switch (run.conclusion) {
      case 'success':   return 'spark-ok';
      case 'failure':   return 'spark-fail';
      case 'cancelled': return 'spark-cancel';
      default: return run.status === 'in_progress' ? 'spark-running' : 'spark-skip';
    }
  }

  rateClass(rate: number): string {
    if (rate >= 80) return 'rate-good';
    if (rate >= 50) return 'rate-warn';
    return 'rate-bad';
  }

  conclusionClass(c: string | null): string {
    switch (c) {
      case 'success':   return 'dot-ok';
      case 'failure':   return 'dot-fail';
      case 'cancelled': return 'dot-cancel';
      default: return 'dot-other';
    }
  }

  shortDate(d: string): string {
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  providerBadge(repo: CiRepo): string {
    return repo.provider === 'gitlab' ? 'GL' : 'GH';
  }
}
