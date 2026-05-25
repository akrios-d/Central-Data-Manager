import { Injectable, inject } from '@angular/core';
import { Observable, of, map, catchError } from 'rxjs';
import { TokenService } from './token.service';
import { GitHubApiService, GhRun } from './github-api.service';
import { GitLabApiService } from './gitlab-api.service';
import {
  CiRepo,
  CiRun,
  CiWorkflow,
  CiTag,
  CiBranch,
  CiComparison,
  CiCommit,
  CiProviderType,
} from '../interfaces/ci-provider.interface';

@Injectable({ providedIn: 'root' })
export class CiProviderService {
  private readonly gh = inject(GitHubApiService);
  private readonly gl = inject(GitLabApiService);
  private readonly tokens = inject(TokenService);

  // ── Repos ─────────────────────────────────────────────────────────────────────

  listRepos(): Observable<CiRepo[]> {
    const provider = this.tokens.activeCiProvider();
    if (provider === 'gitlab' && this.tokens.hasGitLab()) {
      return this.gl.listProjects().pipe(catchError(() => of([])));
    }
    if (this.tokens.hasGitHub()) {
      return this.gh.listRepos().pipe(
        map((rs) => rs.map((r) => this.ghRepoToCiRepo(r))),
        catchError(() => of([])),
      );
    }
    return of([]);
  }

  // ── Runs ──────────────────────────────────────────────────────────────────────

  listRuns(repo: CiRepo): Observable<{ workflow_runs: CiRun[] }> {
    if (repo.provider === 'gitlab') return this.gl.listPipelines(repo.full_name, 20);
    return this.gh
      .listRuns(repo.full_name)
      .pipe(map((r) => ({ workflow_runs: r.workflow_runs.map((run) => this.ghRunToCiRun(run)) })));
  }

  listRunsForHealth(repo: CiRepo): Observable<{ workflow_runs: CiRun[] }> {
    if (repo.provider === 'gitlab') return this.gl.listPipelines(repo.full_name, 100);
    return this.gh
      .listRunsForHealth(repo.full_name)
      .pipe(map((r) => ({ workflow_runs: r.workflow_runs.map((run) => this.ghRunToCiRun(run)) })));
  }

  rerunRun(repo: CiRepo, runId: number): Observable<void> {
    return repo.provider === 'gitlab'
      ? this.gl.retryPipeline(repo.full_name, runId)
      : this.gh.rerunWorkflow(repo.full_name, runId);
  }

  cancelRun(repo: CiRepo, runId: number): Observable<void> {
    return repo.provider === 'gitlab'
      ? this.gl.cancelPipeline(repo.full_name, runId)
      : this.gh.cancelRun(repo.full_name, runId);
  }

  // ── Workflows ─────────────────────────────────────────────────────────────────

  listWorkflows(repo: CiRepo): Observable<CiWorkflow[]> {
    if (repo.provider === 'gitlab') {
      return of([{ id: 0, name: 'Pipeline', path: '.gitlab-ci.yml' }]);
    }
    return this.gh
      .listWorkflows(repo.full_name)
      .pipe(
        map((r) =>
          r.workflows
            .filter((w) => w.state === 'active')
            .map((w) => ({ id: w.id, name: w.name, path: w.path })),
        ),
      );
  }

  getWorkflowInputsYaml(repo: CiRepo, workflowPath: string): Observable<string> {
    if (repo.provider === 'gitlab') return of('');
    return this.gh.getFileContent(repo.full_name, workflowPath);
  }

  // ── Tags & Branches ───────────────────────────────────────────────────────────

  listTags(fullName: string, provider: CiProviderType): Observable<CiTag[]> {
    return provider === 'gitlab' ? this.gl.listTags(fullName) : this.gh.listTags(fullName);
  }

  listBranches(fullName: string, provider: CiProviderType): Observable<CiBranch[]> {
    return provider === 'gitlab' ? this.gl.listBranches(fullName) : this.gh.listBranches(fullName);
  }

  compareRefs(
    fullName: string,
    base: string,
    head: string,
    provider: CiProviderType,
  ): Observable<CiComparison> {
    if (provider === 'gitlab') return this.gl.compareRefs(fullName, base, head);
    return this.gh.compareRefs(fullName, base, head).pipe(
      map((c) => ({
        status: c.status,
        ahead_by: c.ahead_by,
        behind_by: c.behind_by,
        html_url: c.permalink_url,
        commits: c.commits.map(
          (cm) =>
            ({
              sha: cm.sha,
              message: cm.commit.message,
              author: cm.commit.author.name,
              date: cm.commit.author.date,
              url: cm.html_url,
            }) as CiCommit,
        ),
      })),
    );
  }

  getLatestTag(fullName: string, provider: CiProviderType): Observable<string | null> {
    if (provider === 'gitlab') return this.gl.getLatestTag(fullName);
    return this.gh.listTags(fullName).pipe(map((ts) => ts[0]?.name ?? null));
  }

  // ── Chain Builder ─────────────────────────────────────────────────────────────

  triggerWorkflow(
    fullName: string,
    workflowId: number,
    ref: string,
    inputs: Record<string, string>,
    provider: CiProviderType,
  ): Observable<{ gitlabPipelineId?: number }> {
    if (provider === 'gitlab') {
      return this.gl
        .triggerPipeline(fullName, ref, inputs)
        .pipe(map((p) => ({ gitlabPipelineId: p.id })));
    }
    return this.gh.triggerWorkflow(fullName, workflowId, ref, inputs).pipe(map(() => ({})));
  }

  pollGitLabPipeline(fullName: string, pipelineId: number): Observable<CiRun> {
    return this.gl.getPipelineRun(fullName, pipelineId);
  }

  pollGitHubRuns(fullName: string, workflowId: number): Observable<CiRun[]> {
    return this.gh
      .listRuns(fullName, workflowId)
      .pipe(map((r) => r.workflow_runs.map((run) => this.ghRunToCiRun(run))));
  }

  deleteRepoCaches(fullName: string, ref: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gh
        .deleteRepoCaches(fullName, ref)
        .subscribe({ next: () => resolve(), error: (e) => reject(e) });
    });
  }

  // ── Mappers ───────────────────────────────────────────────────────────────────

  ghRepoToCiRepo(r: import('./github-api.service').GhRepo): CiRepo {
    return {
      id: r.id,
      name: r.name,
      full_name: r.full_name,
      private: r.private,
      default_branch: r.default_branch,
      provider: 'github',
      html_url: r.html_url,
    };
  }

  ghRunToCiRun(run: GhRun): CiRun {
    return {
      id: run.id,
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      created_at: run.created_at,
      updated_at: run.updated_at,
      run_started_at: run.run_started_at,
      head_branch: run.head_branch,
      workflow_id: run.workflow_id,
      provider: 'github',
    };
  }
}
