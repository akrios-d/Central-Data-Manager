import { Component, inject, signal, OnInit } from '@angular/core';
import { forkJoin, of, switchMap } from 'rxjs';
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
  private gh = inject(GitHubApiService);
  private ado = inject(DevOpsApiService);

  readonly hasGh  = this.tokens.hasGitHub;
  readonly hasAdo = this.tokens.hasDevOps;

  runs = signal<GhRun[]>([]);
  workItems = signal<DevOpsWorkItem[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  ngOnInit(): void {
    const gh$ = this.tokens.hasGitHub()
      ? this.gh.listRepos().pipe(
          switchMap((repos) => forkJoin(repos.slice(0, 5).map((r) => this.gh.listRuns(r.name))))
        )
      : of([]);

    const ado$ = this.tokens.hasDevOps()
      ? this.ado.listProjects().pipe(
          switchMap((res) => {
            const project = res.value[0]?.name;
            if (!project) return of({ workItems: [] });
            const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${project}' ORDER BY [System.ChangedDate] DESC`;
            return this.ado.queryWorkItems(project, wiql);
          }),
          switchMap((res) => {
            const ids = res.workItems?.slice(0, 10).map((w) => w.id) ?? [];
            if (!ids.length) return of({ value: [] });
            return this.ado.listWorkItems(this.tokens.devopsOrg()!, ids);
          })
        )
      : of({ value: [] });

    forkJoin({ gh: gh$, ado: ado$ }).subscribe({
      next: ({ gh, ado }) => {
        this.runs.set((Array.isArray(gh) ? gh.flatMap((r: any) => r.workflow_runs ?? []) : []).slice(0, 8));
        this.workItems.set((ado as any).value ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load data');
        this.loading.set(false);
      },
    });
  }

  runClass(run: GhRun): string {
    return run.status !== 'completed' ? run.status : (run.conclusion ?? 'unknown');
  }
}
