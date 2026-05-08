import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenService } from './token.service';

export interface GhOrg { login: string; }
export interface GhTokenScopes { scopes: string[] | null; }

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

  getAuthenticatedUser(): Observable<GhUser> {
    return this.http.get<GhUser>('https://api.github.com/user', { headers: this.headers });
  }

  listOrgs(): Observable<GhOrg[]> {
    return this.http.get<GhOrg[]>('https://api.github.com/user/orgs?per_page=100', { headers: this.headers });
  }

  listOrgRepos(org: string): Observable<GhRepo[]> {
    return this.http.get<GhRepo[]>(
      `https://api.github.com/orgs/${org}/repos?per_page=100&sort=updated`,
      { headers: this.headers }
    );
  }

  listRepos(): Observable<GhRepo[]> {
    // /user/repos returns all repos (public + private) for the authenticated user
    // affiliation=owner,collaborator,organization_member covers org repos too
    return this.http.get<GhRepo[]>(
      `https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member`,
      { headers: this.headers }
    );
  }

  // fullName = "owner/repo"
  listWorkflows(fullName: string): Observable<{ workflows: GhWorkflow[] }> {
    return this.http.get<{ workflows: GhWorkflow[] }>(
      `https://api.github.com/repos/${fullName}/actions/workflows`,
      { headers: this.headers }
    );
  }

  listRuns(fullName: string, workflowId?: number): Observable<{ workflow_runs: GhRun[] }> {
    const base = `https://api.github.com/repos/${fullName}/actions`;
    const url = workflowId
      ? `${base}/workflows/${workflowId}/runs?per_page=10`
      : `${base}/runs?per_page=20`;
    return this.http.get<{ workflow_runs: GhRun[] }>(url, { headers: this.headers });
  }

  listBranches(fullName: string): Observable<{ name: string }[]> {
    return this.http.get<{ name: string }[]>(
      `https://api.github.com/repos/${fullName}/branches?per_page=100`,
      { headers: this.headers }
    );
  }

  triggerWorkflow(fullName: string, workflowId: number, ref: string, inputs: Record<string, string>): Observable<void> {
    return this.http.post<void>(
      `https://api.github.com/repos/${fullName}/actions/workflows/${workflowId}/dispatches`,
      { ref, inputs },
      { headers: this.headers }
    );
  }

  rerunWorkflow(fullName: string, runId: number): Observable<void> {
    return this.http.post<void>(
      `https://api.github.com/repos/${fullName}/actions/runs/${runId}/rerun`,
      {},
      { headers: this.headers }
    );
  }

  cancelRun(fullName: string, runId: number): Observable<void> {
    return this.http.post<void>(
      `https://api.github.com/repos/${fullName}/actions/runs/${runId}/cancel`,
      {},
      { headers: this.headers }
    );
  }
}

export interface GhUser {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
  total_private_repos: number;
}

export interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  default_branch: string;
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
