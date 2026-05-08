import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { switchMap, of } from 'rxjs';
import { TokenService } from '../../../core/services/token.service';
import { DevOpsApiService, DevOpsIteration, DevOpsWorkItem } from '../../../core/services/devops-api.service';
import { WorkItemPanelComponent } from '../work-item-panel/work-item-panel.component';

interface StateGroup {
  state: string;
  count: number;
  items: DevOpsWorkItem[];
}

@Component({
  selector: 'app-sprint-widget',
  imports: [DatePipe, RouterLink, WorkItemPanelComponent],
  templateUrl: './sprint-widget.component.html',
  styleUrl: './sprint-widget.component.scss',
})
export class SprintWidgetComponent implements OnInit {
  private ado = inject(DevOpsApiService);
  private tokens = inject(TokenService);

  iteration    = signal<DevOpsIteration | null>(null);
  workItems    = signal<DevOpsWorkItem[]>([]);
  loading      = signal(true);
  error        = signal<string | null>(null);
  stateFilter  = signal<Set<string>>(new Set());
  typeFilter   = signal<Set<string>>(new Set());

  readonly availableTypes = computed(() =>
    [...new Set(this.workItems().map(wi => wi.fields['System.WorkItemType'] as string))].sort()
  );

  readonly filteredItems = computed(() => {
    const sf = this.stateFilter();
    const tf = this.typeFilter();
    return this.workItems().filter(wi =>
      (sf.size === 0 || sf.has(wi.fields['System.State'])) &&
      (tf.size === 0 || tf.has(wi.fields['System.WorkItemType']))
    );
  });

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

  selectedItem = signal<DevOpsWorkItem | null>(null);

  readonly project = this.tokens.devopsProject;
  readonly team    = this.tokens.devopsTeam;

  readonly stateGroups = computed<StateGroup[]>(() => {
    const order = ['New', 'Active', 'Resolved', 'Closed', 'Removed'];
    const map = new Map<string, DevOpsWorkItem[]>();
    for (const wi of this.workItems()) {
      const s = wi.fields['System.State'];
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(wi);
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
    const finish = this.iteration()?.attributes.finishDate;
    if (!finish) return null;
    const diff = new Date(finish).getTime() - Date.now();
    return Math.ceil(diff / 86_400_000);
  });

  readonly progress = computed(() => {
    const total = this.workItems().length;
    if (!total) return 0;
    const done = this.workItems().filter(
      (w) => w.fields['System.State'] === 'Closed' || w.fields['System.State'] === 'Resolved'
    ).length;
    return Math.round((done / total) * 100);
  });

  ngOnInit(): void {
    const project = this.tokens.devopsProject();
    const team    = this.tokens.devopsTeam();

    if (!project || !team) {
      this.loading.set(false);
      return;
    }

    this.ado.getCurrentIteration(project, team).pipe(
      switchMap((res) => {
        const iter = res.value[0];
        if (!iter) return of(null);
        this.iteration.set(iter);
        return this.ado.getIterationWorkItemIds(project, team, iter.id);
      }),
      switchMap((res) => {
        if (!res) return of({ value: [] });
        const ids = res.workItemRelations
          .filter((r) => r.rel === null)
          .map((r) => r.target.id);
        if (!ids.length) return of({ value: [] });
        return this.ado.listWorkItems(project, ids);
      })
    ).subscribe({
      next: (res) => {
        this.workItems.set((res as any).value ?? []);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.message ?? 'Failed to load sprint');
        this.loading.set(false);
      },
    });
  }
}
