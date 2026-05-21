import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map, of, switchMap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TokenService } from './token.service';

export interface JiraSelf {
  accountId: string;
  displayName: string;
  emailAddress: string;
}

export interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
}

export interface JiraBoard {
  id: number;
  name: string;
  type: string;
}

export interface JiraSprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
}

export interface JiraIssueLink {
  type: { name: string; inward: string; outward: string };
  outwardIssue?: {
    id: string;
    key: string;
    fields?: { summary?: string; status?: { name: string }; issuetype?: { name: string } };
  };
  inwardIssue?: {
    id: string;
    key: string;
    fields?: { summary?: string; status?: { name: string }; issuetype?: { name: string } };
  };
}

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string };
    issuetype: { name: string };
    assignee?: { displayName: string; emailAddress?: string } | null;
    reporter?: { displayName: string } | null;
    creator?: { displayName: string } | null;
    priority?: { name: string } | null;
    created: string;
    updated: string;
    description?: any;
    issuelinks?: JiraIssueLink[];
  };
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { id: string; name: string };
}

@Injectable({ providedIn: 'root' })
export class JiraApiService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);

  private get headers(): HttpHeaders {
    const email = this.tokens.jiraEmail() ?? '';
    const token = this.tokens.jiraToken() ?? '';
    return new HttpHeaders({
      Authorization: `Basic ${btoa(email + ':' + token)}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  }

  private get base(): string {
    return `${(this.tokens.jiraBaseUrl() ?? '').replace(/\/$/, '')}/rest/api/3`;
  }

  private get agileBase(): string {
    return `${(this.tokens.jiraBaseUrl() ?? '').replace(/\/$/, '')}/rest/agile/1.0`;
  }

  getMyself(): Observable<JiraSelf> {
    return this.http.get<JiraSelf>(`${this.base}/myself`, { headers: this.headers });
  }

  listProjects(): Observable<JiraProject[]> {
    return this.http
      .get<{
        values: JiraProject[];
      }>(`${this.base}/project/search?maxResults=100&orderBy=name`, { headers: this.headers })
      .pipe(map((r) => r.values));
  }

  listBoards(projectKey: string): Observable<JiraBoard[]> {
    return this.http
      .get<{
        values: JiraBoard[];
      }>(`${this.agileBase}/board?projectKeyOrId=${encodeURIComponent(projectKey)}&maxResults=50`, {
        headers: this.headers,
      })
      .pipe(map((r) => r.values ?? []));
  }

  getActiveSprint(boardId: number): Observable<JiraSprint | null> {
    return this.http
      .get<{
        values: JiraSprint[];
      }>(`${this.agileBase}/board/${boardId}/sprint?state=active&maxResults=1`, {
        headers: this.headers,
      })
      .pipe(map((r) => r.values?.[0] ?? null));
  }

  getActiveSprintForProject(projectKey: string): Observable<JiraSprint | null> {
    return this.listBoards(projectKey).pipe(
      switchMap((boards) => {
        if (!boards.length) return of(null);
        return this.getActiveSprint(boards[0].id).pipe(catchError(() => of(null)));
      }),
      catchError(() => of(null)),
    );
  }

  searchIssues(jql: string): Observable<JiraIssue[]> {
    return this.http
      .get<{
        issues: JiraIssue[];
      }>(
        `${this.base}/search?jql=${encodeURIComponent(jql)}&maxResults=200&fields=summary,status,issuetype,assignee,reporter,creator,priority,created,updated`,
        { headers: this.headers },
      )
      .pipe(map((r) => r.issues ?? []));
  }

  searchIssuesWithLinks(jql: string): Observable<JiraIssue[]> {
    return this.http
      .get<{
        issues: JiraIssue[];
      }>(
        `${this.base}/search?jql=${encodeURIComponent(jql)}&maxResults=500&fields=summary,status,issuetype,assignee,reporter,creator,priority,created,updated,issuelinks`,
        { headers: this.headers },
      )
      .pipe(map((r) => r.issues ?? []));
  }

  getTransitions(issueKey: string): Observable<JiraTransition[]> {
    return this.http
      .get<{
        transitions: JiraTransition[];
      }>(`${this.base}/issue/${encodeURIComponent(issueKey)}/transitions`, {
        headers: this.headers,
      })
      .pipe(map((r) => r.transitions ?? []));
  }

  applyTransition(issueKey: string, transitionId: string): Observable<void> {
    return this.http.post<void>(
      `${this.base}/issue/${encodeURIComponent(issueKey)}/transitions`,
      { transition: { id: transitionId } },
      { headers: this.headers },
    );
  }
}
