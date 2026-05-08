import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin, switchMap } from 'rxjs';
import { DevOpsApiService, DevOpsProject, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { WorkItemPanelComponent } from '../../shared/components/work-item-panel/work-item-panel.component';

const PREFERRED_STATES = ['New', 'Active', 'Resolved', 'Closed'];
const TYPE_OPTIONS = ['Epic', 'Feature', 'User Story', 'Product Backlog Item', 'Task', 'Bug', 'Issue', 'Test Case'];

interface Column { state: string; items: DevOpsWorkItem[]; }

@Component({
  selector: 'app-devops-boards',
  imports: [FormsModule, WorkItemPanelComponent],
  templateUrl: './devops-boards.component.html',
  styleUrl: './devops-boards.component.scss',
})
export class DevopsBoardsComponent implements OnInit {
  private ado    = inject(DevOpsApiService);
  private toasts = inject(ToastService);

  readonly typeOptions = TYPE_OPTIONS;

  projects        = signal<DevOpsProject[]>([]);
  selectedProject = signal<string | null>(null);
  columns         = signal<Column[]>([]);
  loading         = signal(true);
  boardLoading    = signal(false);
  boardReady      = signal(false);
  error           = signal<string | null>(null);
  dragItem        = signal<DevOpsWorkItem | null>(null);
  dragOverState   = signal<string | null>(null);
  saving          = signal<number | null>(null);
  selectedItem    = signal<DevOpsWorkItem | null>(null);

  teamMembers     = signal<string[]>([]);

  // ── Filters ───────────────────────────────────────────────────────────────────
  filterTypes    = signal<Set<string>>(new Set());
  filterAssignee = signal('');
  filterSprint   = signal<'current' | 'all'>('all');

  readonly totalItems = computed(() => this.columns().reduce((s, c) => s + c.items.length, 0));

  private wasDragging = false;

  ngOnInit(): void {
    this.ado.listProjects().subscribe({
      next: (res) => {
        this.projects.set(res.value);
        this.loading.set(false);
        if (res.value.length) {
          this.selectedProject.set(res.value[0].name);
          this.loadTeamMembers(res.value[0].name);
        }
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  loadTeamMembers(project: string): void {
    this.ado.listTeams(project).pipe(
      switchMap(teams => forkJoin(
        teams.value.map(t => this.ado.listTeamMembers(project, t.id))
      ))
    ).subscribe({
      next: (results) => {
        const names = [...new Set(
          results.flatMap(r => r.value.map(m => m.identity.displayName))
        )].sort();
        this.teamMembers.set(names);
      },
    });
  }

  toggleType(type: string): void {
    this.filterTypes.update(s => {
      const next = new Set(s);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  }

  isTypeSelected(type: string): boolean {
    return this.filterTypes().has(type);
  }

  loadBoard(): void {
    const name = this.selectedProject();
    if (!name) return;
    this.boardLoading.set(true);
    this.boardReady.set(false);
    this.columns.set([]);

    const wiql = this.buildWiql(name);

    this.ado.queryWorkItems(name, wiql).subscribe({
      next: (res) => {
        const ids = res.workItems?.slice(0, 500).map(w => w.id) ?? [];
        if (!ids.length) { this.buildColumns([]); return; }
        const batches: number[][] = [];
        for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
        forkJoin(batches.map(b => this.ado.listWorkItems(name, b))).subscribe({
          next: (results) => { this.buildColumns(results.flatMap(r => r.value)); },
          error: () => this.boardLoading.set(false),
        });
      },
      error: (e) => { this.error.set(e?.message); this.boardLoading.set(false); },
    });
  }

  private buildWiql(project: string): string {
    const conditions: string[] = [`[System.TeamProject] = '${project}'`];

    if (this.filterSprint() === 'current') {
      conditions.push(`[System.IterationPath] = @CurrentIteration`);
    }

    const types = [...this.filterTypes()];
    if (types.length) {
      const list = types.map(t => `'${t}'`).join(', ');
      conditions.push(`[System.WorkItemType] IN (${list})`);
    }

    const assignee = this.filterAssignee().trim();
    if (assignee) {
      conditions.push(`[System.AssignedTo] CONTAINS '${assignee}'`);
    }

    return `SELECT [System.Id] FROM WorkItems WHERE ${conditions.join(' AND ')} ORDER BY [System.ChangedDate] DESC`;
  }

  private buildColumns(items: DevOpsWorkItem[]): void {
    const allStates = [...new Set(items.map(i => i.fields['System.State']))];
    const ordered = [
      ...PREFERRED_STATES.filter(s => allStates.includes(s)),
      ...allStates.filter(s => !PREFERRED_STATES.includes(s)),
    ];
    this.columns.set(ordered.map(state => ({
      state,
      items: items.filter(i => i.fields['System.State'] === state),
    })));
    this.boardLoading.set(false);
    this.boardReady.set(true);
  }

  openItem(wi: DevOpsWorkItem): void {
    if (this.wasDragging) return;
    this.selectedItem.set(wi);
  }

  closePanel(): void { this.selectedItem.set(null); }

  onDragStart(event: DragEvent, item: DevOpsWorkItem): void {
    this.wasDragging = true;
    this.dragItem.set(item);
    event.dataTransfer?.setData('text/plain', String(item.id));
    (event.currentTarget as HTMLElement).classList.add('dragging');
  }

  onDragEnd(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('dragging');
    this.dragOverState.set(null);
    setTimeout(() => { this.wasDragging = false; }, 0);
  }

  onDragEnter(state: string): void { this.dragOverState.set(state); }

  onDragLeave(event: DragEvent): void {
    const col = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !col.contains(related)) this.dragOverState.set(null);
  }

  onDrop(targetState: string): void {
    this.dragOverState.set(null);
    const item = this.dragItem();
    if (!item || item.fields['System.State'] === targetState) return;

    const project = this.selectedProject()!;
    const prevState = item.fields['System.State'];
    item.fields['System.State'] = targetState;
    this.buildColumns(this.columns().flatMap(c => c.items));
    this.saving.set(item.id);

    this.ado.updateWorkItemState(project, item.id, targetState).subscribe({
      next: () => { this.saving.set(null); this.toasts.show(`#${item.id} → ${targetState}`, 'success', 2500); },
      error: (e) => {
        item.fields['System.State'] = prevState;
        this.buildColumns(this.columns().flatMap(c => c.items));
        this.saving.set(null);
        this.toasts.show(e?.error?.message ?? 'Failed to update work item', 'danger');
      },
    });
    this.dragItem.set(null);
  }

  priority(wi: DevOpsWorkItem): string {
    const p = wi.fields['Microsoft.VSTS.Common.Priority'];
    if (!p) return '';
    return p <= 1 ? '🔴' : p === 2 ? '🟠' : '🟡';
  }
}
