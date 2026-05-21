import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  catchError,
  debounceTime,
  distinctUntilChanged,
  forkJoin,
  map,
  of,
  skip,
  switchMap,
} from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TokenService } from '../../core/services/token.service';
import { CiProviderService } from '../../core/services/ci-provider.service';
import { CiRepo, CiRun } from '../../core/interfaces/ci-provider.interface';
import { DevOpsApiService } from '../../core/services/devops-api.service';
import { BoardsProviderService } from '../../core/services/boards-provider.service';
import { BoardWorkItem } from '../../core/interfaces/boards-provider.interface';
import { TranslateModule } from '@ngx-translate/core';
import { SprintWidgetComponent } from '../../shared/components/sprint-widget/sprint-widget.component';
import { WorkItemPanelComponent } from '../../shared/components/work-item-panel/work-item-panel.component';
import { AuditLogService, AuditEntry } from '../../core/services/audit-log.service';
import { ChainService } from '../../core/services/chain.service';
import { ChainRun } from '../../core/models/chain.model';
import { AppConfigService } from '../../core/services/app-config.service';

export interface Pipeline {
  workflowId: number;
  name: string;
  repo: string;
  repoFullName: string;
  lastRun: CiRun;
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
  imports: [
    DatePipe,
    RouterLink,
    FormsModule,
    SprintWidgetComponent,
    WorkItemPanelComponent,
    TranslateModule,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private readonly tokens = inject(TokenService);
  private readonly ci = inject(CiProviderService);
  private readonly ado = inject(DevOpsApiService);
  private readonly boards = inject(BoardsProviderService);
  private readonly audit = inject(AuditLogService);
  private readonly chainSvc = inject(ChainService);
  private readonly appConfig = inject(AppConfigService);

  readonly hasCi = computed(() => this.tokens.hasGitHub() || this.tokens.hasGitLab());
  readonly hasAdo = this.tokens.hasDevOps;
  readonly hasBoardsProvider = computed(
    () => this.tokens.hasDevOps() || (this.tokens.hasJira() && !!this.tokens.jiraProject()),
  );

  readonly tokenMaxAgeDays = this.appConfig.tokenMaxAgeDays;

  readonly tokenHealth = computed(() => {
    const providers: { name: string; savedAt: string | null }[] = [];
    if (this.tokens.hasGitHub())
      providers.push({ name: 'GitHub', savedAt: this.tokens.githubSavedAt() });
    if (this.tokens.hasGitLab())
      providers.push({ name: 'GitLab', savedAt: this.tokens.gitlabSavedAt() });
    if (this.tokens.hasDevOps())
      providers.push({ name: 'Azure DevOps', savedAt: this.tokens.devopsSavedAt() });
    if (this.tokens.hasJira()) providers.push({ name: 'Jira', savedAt: this.tokens.jiraSavedAt() });
    return providers;
  });

  readonly recentActivity = computed<AuditEntry[]>(() => this.audit.entries().slice(0, 5));

  readonly lastChainRun = computed<ChainRun | null>(() => this.chainSvc.runs()[0] ?? null);

  allRepos = signal<CiRepo[]>([]);
  pipelines = signal<Pipeline[]>([]);
  workItems = signal<BoardWorkItem[]>([]);
  ghLoading = signal(false);
  adoLoading = signal(false);
  ghError = signal<string | null>(null);
  adoError = signal<string | null>(null);

  selectedItem = signal<BoardWorkItem | null>(null);

  pipelineSearch = signal('');
  expandedRepos = signal<Set<string>>(new Set());
  wiStateFilter = signal<Set<string>>(new Set());

  readonly availableWiStates = computed(() =>
    [...new Set(this.workItems().map((wi) => wi.state))].sort((a, b) => a.localeCompare(b)),
  );

  readonly filteredWorkItems = computed(() => {
    const filter = this.wiStateFilter();
    if (!filter.size) return this.workItems();
    return this.workItems().filter((wi) => filter.has(wi.state));
  });

  toggleWiState(state: string): void {
    this.wiStateFilter.update((s) => {
      const next = new Set(s);
      next.has(state) ? next.delete(state) : next.add(state);
      return next;
    });
  }

  isWiStateActive(state: string): boolean {
    const f = this.wiStateFilter();
    return f.size === 0 || f.has(state);
  }

  toggleRepo(fullName: string): void {
    this.expandedRepos.update((s) => {
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
    return q ? repos.filter((r) => r.full_name.toLowerCase().includes(q)) : repos;
  });

  readonly repoGroups = computed((): RepoGroup[] => {
    const q = this.pipelineSearch().toLowerCase().trim();
    const visibleFullNames = new Set(this.filteredRepos().map((r) => r.full_name));
    const map = new Map<string, Pipeline[]>();
    for (const p of this.pipelines()) {
      if (!visibleFullNames.has(p.repoFullName)) continue;
      if (q && !p.repoFullName.toLowerCase().includes(q) && !p.name.toLowerCase().includes(q))
        continue;
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
    toObservable(this.filteredRepos)
      .pipe(
        skip(1),
        debounceTime(500),
        distinctUntilChanged(
          (a, b) => a.length === b.length && a.every((r, i) => r.full_name === b[i].full_name),
        ),
        switchMap((repos) => {
          this.ghLoading.set(true);
          return this.fetchRunsForRepos(repos);
        }),
        takeUntilDestroyed(),
      )
      .subscribe((pipelines) => {
        this.pipelines.set(pipelines);
        this.ghLoading.set(false);
      });
  }

  ngOnInit(): void {
    if (this.tokens.hasAnyToken()) this.loadCiRepos();
    if (this.tokens.hasDevOps()) this.loadDevOps();
  }

  private loadCiRepos(): void {
    this.ghLoading.set(true);
    this.ci
      .listRepos()
      .pipe(
        catchError((err) => {
          this.ghError.set(err?.message ?? 'Error loading repositories');
          return of([] as CiRepo[]);
        }),
      )
      .subscribe((repos) => {
        this.allRepos.set(repos);
        this.fetchRunsForRepos(repos).subscribe((pipelines) => {
          this.pipelines.set(pipelines);
          this.ghLoading.set(false);
        });
      });
  }

  private fetchRunsForRepos(repos: CiRepo[]) {
    const toFetch = repos.slice(0, MAX_REPOS_FOR_RUNS);
    if (!toFetch.length) return of([] as Pipeline[]);

    return forkJoin(
      toFetch.map((r) =>
        this.ci.listRuns(r).pipe(catchError(() => of({ workflow_runs: [] as CiRun[] }))),
      ),
    ).pipe(
      map((results) => {
        const pipelines: Pipeline[] = [];
        results.forEach((res, i) => {
          const seen = new Set<number>();
          for (const run of res.workflow_runs) {
            if (!seen.has(run.workflow_id)) {
              seen.add(run.workflow_id);
              pipelines.push({
                workflowId: run.workflow_id,
                name: run.name,
                repo: toFetch[i].name,
                repoFullName: toFetch[i].full_name,
                lastRun: run,
              });
            }
          }
        });
        pipelines.sort((a, b) => {
          const aActive = a.lastRun.status === 'completed' ? 0 : 1;
          const bActive = b.lastRun.status === 'completed' ? 0 : 1;
          if (aActive !== bActive) return bActive - aActive;
          return (
            new Date(b.lastRun.created_at).getTime() - new Date(a.lastRun.created_at).getTime()
          );
        });
        return pipelines;
      }),
    );
  }

  private loadDevOps(): void {
    this.adoLoading.set(true);
    let resolvedProject = '';
    this.ado
      .listProjects()
      .pipe(
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
        }),
      )
      .subscribe((res) => {
        const items = res.value ?? [];
        this.workItems.set(items.map((wi: any) => this.boards.normalizeAdoWorkItem(wi)));
        this.adoLoading.set(false);
      });
  }

  runClass(run: CiRun): string {
    return run.status === 'completed' ? (run.conclusion ?? 'unknown') : run.status;
  }

  tokenAgeDays(savedAt: string | null): number | null {
    if (!savedAt) return null;
    return Math.floor((Date.now() - new Date(savedAt).getTime()) / 86_400_000);
  }

  tokenHealthClass(savedAt: string | null): string {
    const days = this.tokenAgeDays(savedAt);
    if (days === null) return 'health-unknown';
    const max = this.tokenMaxAgeDays();
    if (days >= max) return 'health-expired';
    if (days >= max * 0.75) return 'health-warn';
    return 'health-ok';
  }

  private worstStatus(pipelines: Pipeline[]): string {
    const priority = ['failure', 'in_progress', 'queued', 'success', 'unknown'];
    const statuses = new Set(pipelines.map((p) => this.runClass(p.lastRun)));
    return priority.find((s) => statuses.has(s)) ?? 'unknown';
  }
}
