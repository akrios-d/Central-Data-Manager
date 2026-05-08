import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { catchError, debounceTime, distinctUntilChanged, forkJoin, map, of, skip, switchMap } from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TokenService } from '../../core/services/token.service';
import { GitHubApiService, GhRepo, GhRun } from '../../core/services/github-api.service';
import { DevOpsApiService, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { SprintWidgetComponent } from '../../shared/components/sprint-widget/sprint-widget.component';

export interface Pipeline {
  workflowId: number;
  name: string;
  repo: string;
  repoFullName: string;
  lastRun: GhRun;
}

export interface RepoGroup {
  repoFullName: string;
  repo: string;
  pipelines: Pipeline[];
  worstStatus: string;
}

const MAX_REPOS_FOR_RUNS = 15;

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

  allRepos   = signal<GhRepo[]>([]);
  pipelines  = signal<Pipeline[]>([]);
  workItems  = signal<DevOpsWorkItem[]>([]);
  ghLoading  = signal(false);
  adoLoading = signal(false);
  ghError    = signal<string | null>(null);
  adoError   = signal<string | null>(null);

  pipelineSearch  = signal('');
  expandedRepos   = signal<Set<string>>(new Set());

  toggleRepo(fullName: string): void {
    this.expandedRepos.update(s => {
      const next = new Set(s);
      next.has(fullName) ? next.delete(fullName) : next.add(fullName);
      return next;
    });
  }

  isExpanded(fullName: string): boolean {
    return this.expandedRepos().has(fullName);
  }

  readonly filteredRepos = computed(() => {
    const q = this.pipelineSearch().toLowerCase().trim();
    const repos = this.allRepos();
    return q ? repos.filter(r => r.full_name.toLowerCase().includes(q)) : repos;
  });

  readonly repoGroups = computed((): RepoGroup[] => {
    const q = this.pipelineSearch().toLowerCase().trim();
    const visibleFullNames = new Set(this.filteredRepos().map(r => r.full_name));
    const map = new Map<string, Pipeline[]>();
    for (const p of this.pipelines()) {
      if (!visibleFullNames.has(p.repoFullName)) continue;
      if (q && !p.repoFullName.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q)) continue;
      const list = map.get(p.repoFullName) ?? [];
      list.push(p);
      map.set(p.repoFullName, list);
    }
    return Array.from(map.entries()).map(([repoFullName, pipelines]) => ({
      repoFullName,
      repo: pipelines[0].repo,
      pipelines,
      worstStatus: this.worstStatus(pipelines),
    }));
  });

  constructor() {
    // When the filtered repo list changes, refetch runs for the new set
    toObservable(this.filteredRepos).pipe(
      skip(1),
      debounceTime(500),
      distinctUntilChanged((a, b) =>
        a.length === b.length && a.every((r, i) => r.full_name === b[i].full_name)
      ),
      switchMap(repos => {
        this.ghLoading.set(true);
        return this.fetchRunsForRepos(repos);
      }),
      takeUntilDestroyed(),
    ).subscribe(pipelines => {
      this.pipelines.set(pipelines);
      this.ghLoading.set(false);
    });
  }

  ngOnInit(): void {
    if (this.tokens.hasGitHub()) this.loadGitHub();
    if (this.tokens.hasDevOps()) this.loadDevOps();
  }

  private loadGitHub(): void {
    this.ghLoading.set(true);
    this.gh.listRepos().pipe(
      catchError(err => {
        this.ghError.set(err?.message ?? 'GitHub error');
        return of([] as GhRepo[]);
      })
    ).subscribe(repos => {
      this.allRepos.set(repos);
      this.fetchRunsForRepos(repos).subscribe(pipelines => {
        this.pipelines.set(pipelines);
        this.ghLoading.set(false);
      });
    });
  }

  private fetchRunsForRepos(repos: GhRepo[]) {
    const toFetch = repos.slice(0, MAX_REPOS_FOR_RUNS);
    if (!toFetch.length) return of([] as Pipeline[]);

    return forkJoin(
      toFetch.map(r =>
        this.gh.listRuns(r.full_name).pipe(
          catchError(() => of({ workflow_runs: [] as GhRun[] }))
        )
      )
    ).pipe(
      map(results => {
        const pipelines: Pipeline[] = [];
        results.forEach((res, i) => {
          const seen = new Set<number>();
          for (const run of res.workflow_runs) {
            if (!seen.has(run.workflow_id)) {
              seen.add(run.workflow_id);
              pipelines.push({
                workflowId:   run.workflow_id,
                name:         run.name,
                repo:         toFetch[i].name,
                repoFullName: toFetch[i].full_name,
                lastRun:      run,
              });
            }
          }
        });
        pipelines.sort((a, b) => {
          const aActive = a.lastRun.status !== 'completed' ? 1 : 0;
          const bActive = b.lastRun.status !== 'completed' ? 1 : 0;
          if (aActive !== bActive) return bActive - aActive;
          return new Date(b.lastRun.created_at).getTime() - new Date(a.lastRun.created_at).getTime();
        });
        return pipelines;
      })
    );
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

  private worstStatus(pipelines: Pipeline[]): string {
    const priority = ['failure', 'in_progress', 'queued', 'success', 'unknown'];
    const statuses = pipelines.map(p => this.runClass(p.lastRun));
    return priority.find(s => statuses.includes(s)) ?? 'unknown';
  }
}
