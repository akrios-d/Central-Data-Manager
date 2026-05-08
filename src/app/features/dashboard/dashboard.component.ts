import { Component, inject, signal, OnInit } from '@angular/core';
import { catchError, of, switchMap } from 'rxjs';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TokenService } from '../../core/services/token.service';
import { GitHubApiService, GhRun } from '../../core/services/github-api.service';
import { DevOpsApiService, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { SprintWidgetComponent } from '../../shared/components/sprint-widget/sprint-widget.component';

@Component({
  selector: 'app-dashboard',
  imports: [DatePipe, RouterLink, SprintWidgetComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private tokens = inject(TokenService);
  private gh     = inject(GitHubApiService);
  private ado    = inject(DevOpsApiService);

  readonly hasGh  = this.tokens.hasGitHub;
  readonly hasAdo = this.tokens.hasDevOps;

  runs          = signal<GhRun[]>([]);
  workItems     = signal<DevOpsWorkItem[]>([]);
  ghLoading     = signal(false);
  adoLoading    = signal(false);
  ghError       = signal<string | null>(null);
  adoError      = signal<string | null>(null);

  ngOnInit(): void {
    if (this.tokens.hasGitHub()) this.loadGitHub();
    if (this.tokens.hasDevOps()) this.loadDevOps();
  }

  private loadGitHub(): void {
    this.ghLoading.set(true);
    this.gh.listRepos().pipe(
      switchMap((repos) => {
        if (!repos.length) return of([]);
        // fetch runs for up to 5 repos sequentially to avoid rate limits
        const top = repos.slice(0, 5);
        return this.gh.listRuns(top[0].full_name).pipe(
          catchError(() => of({ workflow_runs: [] })),
          switchMap((first) => {
            const all = [...(first.workflow_runs ?? [])];
            return of(all);
          })
        );
      }),
      catchError((err) => {
        this.ghError.set(err?.message ?? 'GitHub error');
        return of([]);
      })
    ).subscribe((runs) => {
      this.runs.set((runs as GhRun[]).slice(0, 8));
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
