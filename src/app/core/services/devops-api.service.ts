import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TokenService } from './token.service';

@Injectable({ providedIn: 'root' })
export class DevOpsApiService {
  private http = inject(HttpClient);
  private tokens = inject(TokenService);

  private get headers(): HttpHeaders {
    const pat = this.tokens.devopsToken() ?? '';
    const encoded = btoa(`:${pat}`);
    return new HttpHeaders({
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json',
    });
  }

  private get patchHeaders(): HttpHeaders {
    const pat = this.tokens.devopsToken() ?? '';
    const encoded = btoa(`:${pat}`);
    return new HttpHeaders({
      Authorization: `Basic ${encoded}`,
      'Content-Type': 'application/json-patch+json',
      'X-HTTP-Method-Override': 'PATCH',
    });
  }

  private base(project?: string): string {
    const org = this.tokens.devopsOrg();
    return project
      ? `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis`
      : `https://dev.azure.com/${org}/_apis`;
  }

  private teamBase(project: string, team: string): string {
    const org = this.tokens.devopsOrg();
    return `https://dev.azure.com/${org}/${encodeURIComponent(project)}/${encodeURIComponent(team)}/_apis`;
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  listProjects(): Observable<DevOpsPagedResult<DevOpsProject>> {
    return this.http.get<DevOpsPagedResult<DevOpsProject>>(
      `${this.base()}/projects?api-version=7.1`,
      { headers: this.headers },
    );
  }

  // ── Teams ───────────────────────────────────────────────────────────────────

  listTeams(project: string): Observable<DevOpsPagedResult<DevOpsTeam>> {
    return this.http.get<DevOpsPagedResult<DevOpsTeam>>(
      `${this.base()}/projects/${encodeURIComponent(project)}/teams?api-version=7.1`,
      { headers: this.headers },
    );
  }

  listTeamMembers(
    project: string,
    teamId: string,
  ): Observable<DevOpsPagedResult<DevOpsTeamMember>> {
    return this.http.get<DevOpsPagedResult<DevOpsTeamMember>>(
      `${this.base()}/projects/${encodeURIComponent(project)}/teams/${teamId}/members?api-version=7.1`,
      { headers: this.headers },
    );
  }

  // ── Iterations / Sprint ─────────────────────────────────────────────────────

  getCurrentIteration(
    project: string,
    team: string,
  ): Observable<DevOpsPagedResult<DevOpsIteration>> {
    return this.http.get<DevOpsPagedResult<DevOpsIteration>>(
      `${this.teamBase(project, team)}/work/teamsettings/iterations?$timeframe=current&api-version=7.1`,
      { headers: this.headers },
    );
  }

  getIterationWorkItemIds(
    project: string,
    team: string,
    iterationId: string,
  ): Observable<DevOpsIterationWorkItems> {
    return this.http.get<DevOpsIterationWorkItems>(
      `${this.teamBase(project, team)}/work/teamsettings/iterations/${iterationId}/workitems?api-version=7.1`,
      { headers: this.headers },
    );
  }

  // ── Work Items ───────────────────────────────────────────────────────────────

  listWorkItems(project: string, ids: number[]): Observable<{ value: DevOpsWorkItem[] }> {
    const idList = ids.join(',');
    return this.http.get<{ value: DevOpsWorkItem[] }>(
      `${this.base(project)}/wit/workitems?ids=${idList}&$expand=all&api-version=7.1`,
      { headers: this.headers },
    );
  }

  queryWorkItems(project: string, wiql: string): Observable<{ workItems: { id: number }[] }> {
    return this.http.post<{ workItems: { id: number }[] }>(
      `${this.base(project)}/wit/wiql?api-version=7.1`,
      { query: wiql },
      { headers: this.headers },
    );
  }

  queryWorkItemLinks(
    project: string,
    wiql: string,
  ): Observable<{
    workItemRelations: Array<{
      rel: string | null;
      source: { id: number } | null;
      target: { id: number } | null;
    }>;
  }> {
    return this.http.post<any>(
      `${this.base(project)}/wit/wiql?api-version=7.1`,
      { query: wiql },
      { headers: this.headers },
    );
  }

  updateWorkItemState(project: string, id: number, state: string): Observable<DevOpsWorkItem> {
    return this.http.post<DevOpsWorkItem>(
      `${this.base(project)}/wit/workitems/${id}?api-version=7.1`,
      [{ op: 'add', path: '/fields/System.State', value: state }],
      { headers: this.patchHeaders },
    );
  }
}

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface DevOpsPagedResult<T> {
  count: number;
  value: T[];
}

export interface DevOpsProject {
  id: string;
  name: string;
  state: string;
  visibility: string;
}

export interface DevOpsTeam {
  id: string;
  name: string;
  description: string;
}

export interface DevOpsTeamMember {
  identity: {
    displayName: string;
    uniqueName: string;
    id: string;
  };
  isTeamAdmin?: boolean;
}

export interface DevOpsIteration {
  id: string;
  name: string;
  path: string;
  attributes: {
    startDate: string | null;
    finishDate: string | null;
    timeFrame: 'past' | 'current' | 'future';
  };
}

export interface DevOpsIterationWorkItems {
  workItemRelations: Array<{
    rel: string | null;
    target: { id: number; url: string };
  }>;
}

export interface DevOpsWorkItem {
  id: number;
  rev: number;
  fields: {
    'System.Title': string;
    'System.State': string;
    'System.WorkItemType': string;
    'System.Description'?: string;
    'System.AssignedTo'?: { displayName: string; imageUrl?: string };
    'System.CreatedBy'?: { displayName: string };
    'System.IterationPath'?: string;
    'System.AreaPath'?: string;
    'Microsoft.VSTS.Common.Priority'?: number;
    'Microsoft.VSTS.Common.Severity'?: string;
    'System.Tags'?: string;
    'System.CreatedDate': string;
    'System.ChangedDate': string;
  };
  _links?: { html?: { href: string } };
  url: string;
}
