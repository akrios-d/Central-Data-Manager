import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, map } from 'rxjs';
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

@Injectable({ providedIn: 'root' })
export class JiraApiService {
  private http   = inject(HttpClient);
  private tokens = inject(TokenService);

  private get headers(): HttpHeaders {
    const email = this.tokens.jiraEmail() ?? '';
    const token = this.tokens.jiraToken() ?? '';
    return new HttpHeaders({
      'Authorization': `Basic ${btoa(`${email}:${token}`)}`,
      'Accept': 'application/json',
    });
  }

  private get base(): string {
    return `${(this.tokens.jiraBaseUrl() ?? '').replace(/\/$/, '')}/rest/api/3`;
  }

  getMyself(): Observable<JiraSelf> {
    return this.http.get<JiraSelf>(`${this.base}/myself`, { headers: this.headers });
  }

  listProjects(): Observable<JiraProject[]> {
    return this.http.get<{ values: JiraProject[] }>(
      `${this.base}/project/search?maxResults=100&orderBy=name`,
      { headers: this.headers }
    ).pipe(map(r => r.values));
  }
}
