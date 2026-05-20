import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { forkJoin } from 'rxjs';
import { TokenService } from '../../../core/services/token.service';
import { BoardsProviderService } from '../../../core/services/boards-provider.service';
import { BoardSprint, BoardWorkItem } from '../../../core/interfaces/boards-provider.interface';
import { WorkItemPanelComponent } from '../work-item-panel/work-item-panel.component';

interface StateGroup {
  state: string;
  count: number;
  items: BoardWorkItem[];
}

@Component({
  selector: 'app-sprint-widget',
  imports: [DatePipe, RouterLink, WorkItemPanelComponent, TranslateModule],
  templateUrl: './sprint-widget.component.html',
  styleUrl: './sprint-widget.component.scss',
})
export class SprintWidgetComponent implements OnInit {
  private boardsProvider = inject(BoardsProviderService);
  private tokens         = inject(TokenService);

  sprint       = signal<BoardSprint | null>(null);
  workItems    = signal<BoardWorkItem[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);
  stateFilter  = signal<Set<string>>(new Set());
  typeFilter   = signal<Set<string>>(new Set());
  selectedItem = signal<BoardWorkItem | null>(null);

  readonly availableTypes = computed(() =>
    [...new Set(this.workItems().map(wi => wi.type))].sort()
  );

  readonly filteredItems = computed(() => {
    const sf = this.stateFilter();
    const tf = this.typeFilter();
    return this.workItems().filter(wi =>
      (sf.size === 0 || sf.has(wi.state)) &&
      (tf.size === 0 || tf.has(wi.type))
    );
  });

  readonly isConfigured = computed(() => {
    const provider = this.tokens.activeBoardsProvider();
    if (provider === 'jira') return !!this.tokens.jiraProject();
    return !!this.tokens.devopsProject() && !!this.tokens.devopsTeam();
  });

  readonly project = computed(() =>
    this.tokens.activeBoardsProvider() === 'jira'
      ? this.tokens.jiraProject()
      : this.tokens.devopsProject()
  );

  readonly team = computed(() =>
    this.tokens.activeBoardsProvider() === 'jira' ? null : this.tokens.devopsTeam()
  );

  toggleState(state: string): void {
    this.stateFilter.update(s => {
      const next = new Set(s);
      next.has(state) ? next.delete(state) : next.add(state);
      return next;
    });
  }

  toggleType(type: string): void {
    this.typeFilter.update(s => {
      const next = new Set(s);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  isStateActive(state: string): boolean {
    const f = this.stateFilter();
    return f.size === 0 || f.has(state);
  }

  isTypeActive(type: string): boolean {
    const f = this.typeFilter();
    return f.size === 0 || f.has(type);
  }

  readonly hasFilter = computed(() => this.stateFilter().size > 0 || this.typeFilter().size > 0);

  readonly stateGroups = computed<StateGroup[]>(() => {
    const order = ['New', 'Active', 'Resolved', 'Closed', 'Removed', 'To Do', 'In Progress', 'Done'];
    const map = new Map<string, BoardWorkItem[]>();
    for (const wi of this.workItems()) {
      if (!map.has(wi.state)) map.set(wi.state, []);
      map.get(wi.state)!.push(wi);
    }
    return [...map.entries()]
      .sort((a, b) => {
        const ia = order.indexOf(a[0]);
        const ib = order.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
      })
      .map(([state, items]) => ({ state, count: items.length, items }));
  });

  readonly daysLeft = computed(() => {
    const finish = this.sprint()?.endDate;
    if (!finish) return null;
    const diff = new Date(finish).getTime() - Date.now();
    return Math.ceil(diff / 86_400_000);
  });

  readonly progress = computed(() => {
    const total = this.workItems().length;
    if (!total) return 0;
    const done = this.workItems().filter(
      w => w.state === 'Closed' || w.state === 'Resolved' || w.state === 'Done'
    ).length;
    return Math.round((done / total) * 100);
  });

  ngOnInit(): void {
    const project = this.project();
    const team    = this.team() ?? undefined;

    if (!this.isConfigured() || !project) {
      this.loading.set(false);
      return;
    }

    forkJoin([
      this.boardsProvider.getCurrentSprint(project, team),
      this.boardsProvider.getSprintWorkItems(project, team),
    ]).subscribe({
      next: ([sprint, items]) => {
        this.sprint.set(sprint);
        this.workItems.set(items);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Failed to load sprint');
        this.loading.set(false);
      },
    });
  }
}
