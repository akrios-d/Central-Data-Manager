import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, from, of, throwError } from 'rxjs';
import { map, mergeMap, switchMap, toArray } from 'rxjs/operators';
import { DevOpsApiService, DevOpsWorkItem } from './devops-api.service';
import { JiraApiService, JiraIssue } from './jira-api.service';
import { TokenService } from './token.service';
import { BoardFilters, BoardProject, BoardSprint, BoardWorkItem } from '../interfaces/boards-provider.interface';

@Injectable({ providedIn: 'root' })
export class BoardsProviderService {
  private ado    = inject(DevOpsApiService);
  private jira   = inject(JiraApiService);
  private tokens = inject(TokenService);

  get provider(): 'devops' | 'jira' { return this.tokens.activeBoardsProvider(); }

  listProjects(): Observable<BoardProject[]> {
    if (this.provider === 'jira') {
      return this.jira.listProjects().pipe(
        map(ps => ps.map(p => ({ id: p.key, name: p.name })))
      );
    }
    return this.ado.listProjects().pipe(
      map(r => r.value.map(p => ({ id: p.name, name: p.name })))
    );
  }

  listWorkItems(projectId: string, filters: BoardFilters): Observable<BoardWorkItem[]> {
    if (this.provider === 'jira') {
      return this.jira.searchIssues(this.buildJql(projectId, filters)).pipe(
        map(issues => issues.map(i => this.normalizeJiraIssue(i)))
      );
    }
    return this.loadAdoWorkItems(projectId, filters);
  }

  updateItemState(projectId: string, itemId: number | string, newState: string): Observable<void> {
    if (this.provider === 'jira') {
      const key = String(itemId);
      return this.jira.getTransitions(key).pipe(
        switchMap(transitions => {
          const t = transitions.find(tr => tr.to.name === newState);
          if (!t) return throwError(() => new Error(`No transition to "${newState}" available`));
          return this.jira.applyTransition(key, t.id);
        })
      );
    }
    return this.ado.updateWorkItemState(projectId, Number(itemId), newState).pipe(map(() => undefined));
  }

  getCurrentSprint(projectId: string, teamId?: string): Observable<BoardSprint | null> {
    if (this.provider === 'jira') {
      return this.jira.getActiveSprintForProject(projectId).pipe(
        map(s => s ? { id: String(s.id), name: s.name, startDate: s.startDate ?? null, endDate: s.endDate ?? null } : null)
      );
    }
    if (!teamId) return of(null);
    return this.ado.getCurrentIteration(projectId, teamId).pipe(
      map(res => {
        const iter = res.value[0];
        if (!iter) return null;
        return { id: iter.id, name: iter.name, startDate: iter.attributes.startDate, endDate: iter.attributes.finishDate };
      })
    );
  }

  getSprintWorkItems(projectId: string, teamId?: string): Observable<BoardWorkItem[]> {
    if (this.provider === 'jira') {
      return this.jira.searchIssues(
        `project = "${projectId}" AND sprint in openSprints() ORDER BY updated DESC`
      ).pipe(map(issues => issues.map(i => this.normalizeJiraIssue(i))));
    }
    if (!teamId) return of([]);
    return this.ado.getCurrentIteration(projectId, teamId).pipe(
      switchMap(res => {
        const iter = res.value[0];
        if (!iter) return of({ value: [] as DevOpsWorkItem[] });
        return this.ado.getIterationWorkItemIds(projectId, teamId, iter.id).pipe(
          switchMap(iwi => {
            const ids = iwi.workItemRelations.filter(r => r.rel === null).map(r => r.target.id);
            if (!ids.length) return of({ value: [] as DevOpsWorkItem[] });
            return this.ado.listWorkItems(projectId, ids);
          })
        );
      }),
      map((res: any) => (res.value as DevOpsWorkItem[]).map(wi => this.normalizeAdoWorkItem(wi)))
    );
  }

  listAssignees(projectId: string): Observable<string[]> {
    if (this.provider === 'jira') {
      return this.jira.searchIssues(
        `project = "${projectId}" AND assignee is not EMPTY ORDER BY updated DESC`
      ).pipe(
        map(issues => [...new Set(
          issues.map(i => i.fields.assignee?.displayName).filter((n): n is string => !!n)
        )].sort())
      );
    }
    return this.ado.listTeams(projectId).pipe(
      switchMap(teams => from(teams.value).pipe(
        mergeMap(t => this.ado.listTeamMembers(projectId, t.id)),
        toArray()
      )),
      map(results => [...new Set(
        results.flatMap(r => r.value.map(m => m.identity.displayName))
      )].sort())
    );
  }

  normalizeAdoWorkItem(wi: DevOpsWorkItem): BoardWorkItem {
    const p = wi.fields['Microsoft.VSTS.Common.Priority'];
    const rawTags = wi.fields['System.Tags'];
    return {
      id: wi.id,
      title: wi.fields['System.Title'],
      type: wi.fields['System.WorkItemType'],
      state: wi.fields['System.State'],
      assignee: wi.fields['System.AssignedTo']?.displayName ?? null,
      sprint: wi.fields['System.IterationPath'] ?? null,
      url: wi._links?.html?.href ?? wi.url,
      priorityEmoji: p == null ? '' : p <= 1 ? '🔴' : p === 2 ? '🟠' : '🟡',
      priorityLabel: p == null ? null : p <= 1 ? '1 – Critical' : p === 2 ? '2 – High' : p === 3 ? '3 – Medium' : '4 – Low',
      createdDate: wi.fields['System.CreatedDate'],
      changedDate: wi.fields['System.ChangedDate'],
      description: wi.fields['System.Description'] ?? null,
      severity: wi.fields['Microsoft.VSTS.Common.Severity'] ?? null,
      areaPath: wi.fields['System.AreaPath'] ?? null,
      createdBy: wi.fields['System.CreatedBy']?.displayName ?? null,
      tags: rawTags ? rawTags.split(';').map(t => t.trim()).filter(Boolean) : [],
    };
  }

  private normalizeJiraIssue(issue: JiraIssue): BoardWorkItem {
    const pName = issue.fields.priority?.name;
    const pEmoji = !pName ? '' :
      (pName === 'Highest' || pName === 'Critical') ? '🔴' :
      pName === 'High' ? '🟠' :
      pName === 'Medium' ? '🟡' : '';
    const baseUrl = (this.tokens.jiraBaseUrl() ?? '').replace(/\/$/, '');
    return {
      id: issue.key,
      title: issue.fields.summary,
      type: issue.fields.issuetype.name,
      state: issue.fields.status.name,
      assignee: issue.fields.assignee?.displayName ?? null,
      sprint: null,
      url: `${baseUrl}/browse/${issue.key}`,
      priorityEmoji: pEmoji,
      priorityLabel: pName ?? null,
      createdDate: issue.fields.created,
      changedDate: issue.fields.updated,
      description: null,
      severity: null,
      areaPath: null,
      createdBy: issue.fields.creator?.displayName ?? null,
      tags: [],
    };
  }

  private loadAdoWorkItems(project: string, filters: BoardFilters): Observable<BoardWorkItem[]> {
    return this.ado.queryWorkItems(project, this.buildWiql(project, filters)).pipe(
      switchMap(res => {
        const ids = res.workItems?.slice(0, 500).map(w => w.id) ?? [];
        if (!ids.length) return of([] as BoardWorkItem[]);
        const batches: number[][] = [];
        for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
        return forkJoin(batches.map(b => this.ado.listWorkItems(project, b))).pipe(
          map(results => results.flatMap(r => r.value).map(wi => this.normalizeAdoWorkItem(wi)))
        );
      })
    );
  }

  private buildWiql(project: string, filters: BoardFilters): string {
    const conditions: string[] = [`[System.TeamProject] = '${project}'`];
    if (filters.sprint === 'current') conditions.push(`[System.IterationPath] = @CurrentIteration`);
    if (filters.hiddenStates.length) {
      const list = filters.hiddenStates.map(s => `'${s}'`).join(', ');
      conditions.push(`[System.State] NOT IN (${list})`);
    }
    if (filters.types.length) {
      const list = filters.types.map(t => `'${t}'`).join(', ');
      conditions.push(`[System.WorkItemType] IN (${list})`);
    }
    if (filters.assignee.trim()) {
      conditions.push(`[System.AssignedTo] CONTAINS '${filters.assignee.trim()}'`);
    }
    return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;
  }

  private buildJql(projectId: string, filters: BoardFilters): string {
    const parts: string[] = [`project = "${projectId}"`];
    if (filters.sprint === 'current') parts.push('sprint in openSprints()');
    if (filters.types.length) {
      const list = filters.types.map(t => `"${t}"`).join(', ');
      parts.push(`issuetype in (${list})`);
    }
    if (filters.assignee.trim()) parts.push(`assignee = "${filters.assignee.trim()}"`);
    return `${parts.join(' AND ')} ORDER BY updated DESC`;
  }
}
