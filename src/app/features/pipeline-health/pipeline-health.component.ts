import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { GitHubApiService, GhRepo, GhRun } from '../../core/services/github-api.service';
import { firstValueFrom } from 'rxjs';

interface WorkflowStat {
  id: number;
  name: string;
  successRate: number;    // 0-100
  avgDuration: number;    // ms
  lastConclusion: string | null;
  recentRuns: GhRun[];   // last 10 for sparkline
  totalRuns: number;
}

@Component({
  selector: 'app-pipeline-health',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule],
  templateUrl: './pipeline-health.component.html',
  styleUrl: './pipeline-health.component.scss',
})
export class PipelineHealthComponent {
  private gh = inject(GitHubApiService);

  // ── Repo list ─────────────────────────────────────────────────────────────
  allRepos     = signal<GhRepo[]>([]);
  reposLoading = signal(false);
  repoSearch   = signal('');
  selectedRepo = signal<GhRepo | null>(null);

  filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase();
    return q ? this.allRepos().filter(r => r.full_name.toLowerCase().includes(q)) : this.allRepos();
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  stats        = signal<WorkflowStat[]>([]);
  statsLoading = signal(false);
  statsError   = signal('');

  async loadRepos() {
    if (this.allRepos().length) return;
    this.reposLoading.set(true);
    try {
      const repos = await firstValueFrom(this.gh.listRepos());
      this.allRepos.set(repos);
    } catch { /* ignore */ } finally {
      this.reposLoading.set(false);
    }
  }

  async selectRepo(repo: GhRepo) {
    this.selectedRepo.set(repo);
    this.stats.set([]);
    this.statsError.set('');
    this.statsLoading.set(true);

    try {
      const res = await firstValueFrom(this.gh.listRunsForHealth(repo.full_name));
      const runs = res.workflow_runs ?? [];
      this.stats.set(this.computeStats(runs));
    } catch (e: any) {
      this.statsError.set(e?.error?.message ?? 'Error loading runs');
    } finally {
      this.statsLoading.set(false);
    }
  }

  private computeStats(runs: GhRun[]): WorkflowStat[] {
    const byWorkflow = new Map<number, GhRun[]>();
    for (const r of runs) {
      if (!byWorkflow.has(r.workflow_id)) byWorkflow.set(r.workflow_id, []);
      byWorkflow.get(r.workflow_id)!.push(r);
    }

    return [...byWorkflow.entries()]
      .map(([id, wRuns]) => {
        const completed = wRuns.filter(r => r.status === 'completed');
        const successes = completed.filter(r => r.conclusion === 'success');
        const successRate = completed.length ? Math.round((successes.length / completed.length) * 100) : 0;

        const durations = completed
          .map(r => {
            const start = r.run_started_at ?? r.created_at;
            return new Date(r.updated_at).getTime() - new Date(start).getTime();
          })
          .filter(d => d > 0 && d < 3_600_000); // ignore > 1h (likely stale data)

        const avgDuration = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;

        const sorted = [...wRuns].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        return {
          id,
          name: sorted[0]?.name ?? `Workflow ${id}`,
          successRate,
          avgDuration,
          lastConclusion: sorted[0]?.conclusion ?? null,
          recentRuns: sorted.slice(0, 10),
          totalRuns: wRuns.length,
        } satisfies WorkflowStat;
      })
      .sort((a, b) => a.successRate - b.successRate); // worst first
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  formatDuration(ms: number): string {
    if (!ms) return '—';
    if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return s ? `${m}m ${s}s` : `${m}m`;
  }

  sparkDot(run: GhRun): string {
    switch (run.conclusion) {
      case 'success':   return '●';
      case 'failure':   return '●';
      case 'cancelled': return '●';
      default: return run.status === 'in_progress' ? '◌' : '●';
    }
  }

  sparkClass(run: GhRun): string {
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

  shortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  conclusionClass(c: string | null): string {
    switch (c) {
      case 'success':   return 'dot-ok';
      case 'failure':   return 'dot-fail';
      case 'cancelled': return 'dot-cancel';
      default: return 'dot-other';
    }
  }
}
