import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { EMPTY, Observable, expand, map, reduce } from 'rxjs';
import { TokenService } from './token.service';
import {
  CiRepo,
  CiRun,
  CiTag,
  CiBranch,
  CiComparison,
  CiCommit,
} from '../interfaces/ci-provider.interface';

interface GlProject {
  id: number;
  name: string;
  path_with_namespace: string;
  visibility: string;
  default_branch: string;
  web_url: string;
}

interface GlPipeline {
  id: number;
  status: string;
  ref: string;
  web_url: string;
  created_at: string;
  updated_at: string;
  name?: string;
}

interface GlTag {
  name: string;
}
interface GlBranch {
  name: string;
}

interface GlCommit {
  id: string;
  message: string;
  author_name: string;
  created_at: string;
  web_url?: string;
}

export interface GlMergeRequest {
  id: number;
  iid: number;
  title: string;
  state: string;
  draft: boolean;
  author: { name: string; username: string };
  created_at: string;
  updated_at: string;
  web_url: string;
  source_branch: string;
  target_branch: string;
  labels: string[];
  reviewers: { name: string; username: string }[];
  merged_at: string | null;
}

export interface GlMergeRequestDetail extends GlMergeRequest {
  description: string | null;
  changes_count: string | null;
  user_notes_count: number;
}

interface GlComparison {
  commits: GlCommit[];
  compare_same_ref: boolean;
}

@Injectable({ providedIn: 'root' })
export class GitLabApiService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);

  private get base(): string {
    return (this.tokens.gitlabBaseUrl() ?? 'https://gitlab.com').replace(/\/$/, '') + '/api/v4';
  }

  private get host(): string {
    return (this.tokens.gitlabBaseUrl() ?? 'https://gitlab.com').replace(/\/$/, '');
  }

  private get headers(): HttpHeaders {
    return new HttpHeaders({ 'PRIVATE-TOKEN': this.tokens.gitlabToken() ?? '' });
  }

  private enc(p: string): string {
    return encodeURIComponent(p);
  }

  // ── Projects ──────────────────────────────────────────────────────────────────

  listProjects(): Observable<CiRepo[]> {
    const fetchPage = (page: number): Observable<GlProject[]> =>
      this.http.get<GlProject[]>(
        `${this.base}/projects?membership=true&per_page=100&page=${page}&order_by=last_activity_at`,
        { headers: this.headers },
      );
    return fetchPage(1).pipe(
      expand((results, idx) => (results.length === 100 ? fetchPage(idx + 2) : EMPTY)),
      reduce((acc: GlProject[], results: GlProject[]) => [...acc, ...results], []),
      map((ps) => ps.map((p) => this.toRepo(p))),
    );
  }

  testConnection(): Observable<{ count: number }> {
    return this.http
      .get<
        GlProject[]
      >(`${this.base}/projects?membership=true&per_page=1`, { headers: this.headers })
      .pipe(map((ps) => ({ count: ps.length })));
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────────

  listPipelines(fullPath: string, perPage = 20): Observable<{ workflow_runs: CiRun[] }> {
    return this.http
      .get<
        GlPipeline[]
      >(`${this.base}/projects/${this.enc(fullPath)}/pipelines?per_page=${perPage}&order_by=id&sort=desc`, { headers: this.headers })
      .pipe(map((ps) => ({ workflow_runs: ps.map((p) => this.toRun(p)) })));
  }

  retryPipeline(fullPath: string, pipelineId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/projects/${this.enc(fullPath)}/pipelines/${pipelineId}/retry`,
      {},
      { headers: this.headers },
    );
  }

  cancelPipeline(fullPath: string, pipelineId: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/projects/${this.enc(fullPath)}/pipelines/${pipelineId}/cancel`,
      {},
      { headers: this.headers },
    );
  }

  triggerPipeline(
    fullPath: string,
    ref: string,
    variables: Record<string, string>,
  ): Observable<GlPipeline> {
    const vars = Object.entries(variables).map(([key, value]) => ({
      key,
      value,
      variable_type: 'env_var',
    }));
    return this.http.post<GlPipeline>(
      `${this.base}/projects/${this.enc(fullPath)}/pipeline`,
      { ref, variables: vars },
      { headers: this.headers },
    );
  }

  getPipelineRun(fullPath: string, pipelineId: number): Observable<CiRun> {
    return this.http
      .get<GlPipeline>(`${this.base}/projects/${this.enc(fullPath)}/pipelines/${pipelineId}`, {
        headers: this.headers,
      })
      .pipe(map((p) => this.toRun(p)));
  }

  // ── Tags & Branches ───────────────────────────────────────────────────────────

  listTags(fullPath: string): Observable<CiTag[]> {
    return this.http
      .get<
        GlTag[]
      >(`${this.base}/projects/${this.enc(fullPath)}/repository/tags?per_page=50`, { headers: this.headers })
      .pipe(map((ts) => ts.map((t) => ({ name: t.name }))));
  }

  listBranches(fullPath: string): Observable<CiBranch[]> {
    return this.http
      .get<
        GlBranch[]
      >(`${this.base}/projects/${this.enc(fullPath)}/repository/branches?per_page=100`, { headers: this.headers })
      .pipe(map((bs) => bs.map((b) => ({ name: b.name }))));
  }

  searchBranches(fullPath: string, query: string): Observable<CiBranch[]> {
    const encoded = encodeURIComponent(query);
    return this.http
      .get<
        GlBranch[]
      >(`${this.base}/projects/${this.enc(fullPath)}/repository/branches?search=${encoded}&per_page=20`, { headers: this.headers })
      .pipe(map((bs) => bs.map((b) => ({ name: b.name }))));
  }

  compareRefs(fullPath: string, from: string, to: string): Observable<CiComparison> {
    return this.http
      .get<GlComparison>(
        `${this.base}/projects/${this.enc(fullPath)}/repository/compare?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { headers: this.headers },
      )
      .pipe(
        map((c) => {
          const commits: CiCommit[] = c.commits.map((cm) => ({
            sha: cm.id,
            message: cm.message,
            author: cm.author_name,
            date: cm.created_at,
            url: cm.web_url ?? `${this.host}/${fullPath}/-/commit/${cm.id}`,
          }));
          return {
            status: commits.length === 0 ? 'identical' : 'ahead',
            ahead_by: commits.length,
            behind_by: 0,
            commits,
            html_url: `${this.host}/${fullPath}/-/compare/${encodeURIComponent(from)}...${encodeURIComponent(to)}`,
          };
        }),
      );
  }

  listMergeRequests(
    fullPath: string,
    state: 'opened' | 'closed' | 'merged' | 'all' = 'opened',
  ): Observable<GlMergeRequest[]> {
    return this.http.get<GlMergeRequest[]>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests?state=${state}&per_page=50&order_by=created_at&sort=desc`,
      { headers: this.headers },
    );
  }

  getMergeRequest(fullPath: string, iid: number): Observable<GlMergeRequestDetail> {
    return this.http.get<GlMergeRequestDetail>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests/${iid}`,
      { headers: this.headers },
    );
  }

  getLatestTag(fullPath: string): Observable<string | null> {
    return this.listTags(fullPath).pipe(map((ts) => ts[0]?.name ?? null));
  }

  // ── Mappers ───────────────────────────────────────────────────────────────────

  private toRepo(p: GlProject): CiRepo {
    return {
      id: p.id,
      name: p.name,
      full_name: p.path_with_namespace,
      private: p.visibility === 'private' || p.visibility === 'internal',
      default_branch: p.default_branch ?? 'main',
      provider: 'gitlab',
      html_url: p.web_url,
    };
  }

  toRun(p: GlPipeline): CiRun {
    return {
      id: p.id,
      name: p.name || 'Pipeline',
      status: this.normalizeStatus(p.status),
      conclusion: this.normalizeConclusion(p.status),
      html_url: p.web_url,
      created_at: p.created_at,
      updated_at: p.updated_at,
      head_branch: p.ref,
      workflow_id: 0,
      provider: 'gitlab',
    };
  }

  private normalizeStatus(status: string): string {
    switch (status) {
      case 'running':
        return 'in_progress';
      case 'success':
      case 'failed':
      case 'canceled':
      case 'skipped':
        return 'completed';
      default:
        return 'queued';
    }
  }

  createMergeRequest(
    fullPath: string,
    title: string,
    sourceBranch: string,
    targetBranch: string,
    description?: string,
  ): Observable<GlMergeRequest> {
    return this.http.post<GlMergeRequest>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests`,
      {
        title,
        source_branch: sourceBranch,
        target_branch: targetBranch,
        description: description ?? '',
      },
      { headers: this.headers },
    );
  }

  acceptMergeRequest(fullPath: string, iid: number): Observable<void> {
    return this.http.put<void>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests/${iid}/merge`,
      {},
      { headers: this.headers },
    );
  }

  approveMergeRequest(fullPath: string, iid: number): Observable<void> {
    return this.http.post<void>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests/${iid}/approve`,
      {},
      { headers: this.headers },
    );
  }

  unapproveMergeRequest(fullPath: string, iid: number): Observable<void> {
    return this.http.delete<void>(
      `${this.base}/projects/${this.enc(fullPath)}/merge_requests/${iid}/approve`,
      { headers: this.headers },
    );
  }

  private normalizeConclusion(status: string): CiRun['conclusion'] {
    switch (status) {
      case 'success':
        return 'success';
      case 'failed':
        return 'failure';
      case 'canceled':
        return 'cancelled';
      case 'skipped':
        return 'skipped';
      default:
        return null;
    }
  }
}
