import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { catchError, of, switchMap, forkJoin } from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TokenService } from '../../core/services/token.service';
import { GitHubApiService, GhRun } from '../../core/services/github-api.service';
import { DevOpsApiService, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { SprintWidgetComponent } from '../../shared/components/sprint-widget/sprint-widget.component';

export interface Pipeline {
  workflowId: number;
  name: string;
  repo: string;
  repoFullName: string;
  lastRun: GhRun;
}

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, FormsModule, SprintWidgetComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private tokens = inject(TokenService);
  private gh     = inject(GitHubApiService);
  private ado    = inject(DevOpsApiService);

  readonly hasGh  = this.tokens.hasGitHub;
  readonly hasAdo = this.tokens.hasDevOps;

  pipelines  = signal<Pipeline[]>([]);
  workItems  = signal<DevOpsWorkItem[]>([]);
  ghLoading  = signal(false);
  adoLoading = signal(false);
  ghError    = signal<string | null>(null);
  adoError   = signal<string | null>(null);

  pipelineSearch = signal('');

  readonly filteredPipelines = computed(() => {
    const q = this.pipelineSearch().toLowerCase().trim();
    if (!q) return this.pipelines();
    return this.pipelines().filter(
      (p) => p.name.toLowerCase().includes(q) || p.repo.toLowerCase().includes(q)
    );
  });

  ngOnInit(): void {
    if (this.tokens.hasGitHub()) this.loadGitHub();
    if (this.tokens.hasDevOps()) this.loadDevOps();
  }

  private loadGitHub(): void {
    this.ghLoading.set(true);
    this.gh.listRepos().pipe(
      switchMap((repos) => {
        if (!repos.length) return of([]);
        // top 5 repos mais recentes
        const top = repos.slice(0, 5);
        return forkJoin(
          top.map((r) =>
            this.gh.listRuns(r.full_name).pipe(
              catchError(() => of({ workflow_runs: [] }))
            )
          )
        ).pipe(
          switchMap((results) => {
            const pipelines: Pipeline[] = [];
            results.forEach((res, i) => {
              const runs = (res as any).workflow_runs as GhRun[];
              const seen = new Set<number>();
              for (const run of runs) {
                if (!seen.has(run.workflow_id)) {
                  seen.add(run.workflow_id);
                  pipelines.push({
                    workflowId:   run.workflow_id,
                    name:         run.name,
                    repo:         top[i].name,
                    repoFullName: top[i].full_name,
                    lastRun:      run,
                  });
                }
              }
            });
            // ordenar: running primeiro, depois por data desc
            pipelines.sort((a, b) => {
              const aActive = a.lastRun.status !== 'completed' ? 1 : 0;
              const bActive = b.lastRun.status !== 'completed' ? 1 : 0;
              if (aActive !== bActive) return bActive - aActive;
              return new Date(b.lastRun.created_at).getTime() - new Date(a.lastRun.created_at).getTime();
            });
            return of(pipelines);
          })
        );
      }),
      catchError((err) => {
        this.ghError.set(err?.message ?? 'GitHub error');
        return of([]);
      })
    ).subscribe((pipelines) => {
      this.pipelines.set(pipelines as Pipeline[]);
      this.ghLoading.set(false);
    });
  }

  private loadDevOps(): void {
    this.adoLoading.set(true);
    let resolvedProject = '';
    this.ado.listProjects().pipe(
      switchMap((res) => {
        resolvedProject = res.value[0]?.name ?? '';
        if (!resolvedProject) return of({ workItems: [] });
        const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${resolvedProject}' ORDER BY [System.ChangedDate] DESC`;
        return this.ado.queryWorkItems(resolvedProject, wiql);
      }),
      switchMap((res) => {
        const ids = res.workItems?.slice(0, 10).map((w) => w.id) ?? [];
        if (!ids.length || !resolvedProject) return of({ value: [] });
        return this.ado.listWorkItems(resolvedProject, ids);
      }),
      catchError((err) => {
        this.adoError.set(err?.message ?? 'Azure DevOps error');
        return of({ value: [] });
      })
    ).subscribe((res) => {
      this.workItems.set((res as any).value ?? []);
      this.adoLoading.set(false);
    });
  }

  runClass(run: GhRun): string {
    return run.status !== 'completed' ? run.status : (run.conclusion ?? 'unknown');
  }
}
