import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class GitHubApiService {
  private http = inject(HttpClient);
  private tokens = inject(TokenService);

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.tokens.githubToken()}`,
      Accept: 'application/vnd.github+json',
    });
  }

  private get owner(): string {
    return this.tokens.githubOwner() ?? '';
  }

  listRepos(): Observable<GhRepo[]> {
    return this.http.get<GhRepo[]>(
      `https://api.github.com/users/${this.owner}/repos?per_page=100&sort=updated`,
      { headers: this.headers }
    );
  }

  listWorkflows(repo: string): Observable<{ workflows: GhWorkflow[] }> {
    return this.http.get<{ workflows: GhWorkflow[] }>(
      `https://api.github.com/repos/${this.owner}/${repo}/actions/workflows`,
      { headers: this.headers }
    );
  }

  listRuns(repo: string, workflowId?: number): Observable<{ workflow_runs: GhRun[] }> {
    const base = `https://api.github.com/repos/${this.owner}/${repo}/actions`;
    const url = workflowId
      ? `${base}/workflows/${workflowId}/runs?per_page=10`
      : `${base}/runs?per_page=20`;
    return this.http.get<{ workflow_runs: GhRun[] }>(url, { headers: this.headers });
  }

  rerunWorkflow(repo: string, runId: number): Observable<void> {
    return this.http.post<void>(
      `https://api.github.com/repos/${this.owner}/${repo}/actions/runs/${runId}/rerun`,
      {},
      { headers: this.headers }
    );
  }

  cancelRun(repo: string, runId: number): Observable<void> {
    return this.http.post<void>(
      `https://api.github.com/repos/${this.owner}/${repo}/actions/runs/${runId}/cancel`,
      {},
      { headers: this.headers }
    );
  }
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
}

export interface GhWorkflow {
  id: number;
  name: string;
  state: string;
  path: string;
}

export interface GhRun {
  id: number;
  name: string;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | null;
  html_url: string;
  created_at: string;
  updated_at: string;
  head_branch: string;
  head_sha: string;
  repository: { name: string; full_name: string };
  workflow_id: number;
}
