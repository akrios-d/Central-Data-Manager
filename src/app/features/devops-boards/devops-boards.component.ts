import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevOpsApiService, DevOpsProject, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { WorkItemPanelComponent } from '../../shared/components/work-item-panel/work-item-panel.component';

const STATES = ['New', 'Active', 'Resolved', 'Closed'];

interface Column {
  state: string;
  items: DevOpsWorkItem[];
}

@Component({
  selector: 'app-devops-boards',
  imports: [FormsModule, WorkItemPanelComponent],
  templateUrl: './devops-boards.component.html',
  styleUrl: './devops-boards.component.scss',
})
export class DevopsBoardsComponent implements OnInit {
  private ado    = inject(DevOpsApiService);
  private toasts = inject(ToastService);

  projects        = signal<DevOpsProject[]>([]);
  selectedProject = signal<string | null>(null);
  columns         = signal<Column[]>([]);
  loading         = signal(true);
  boardLoading    = signal(false);
  error           = signal<string | null>(null);
  dragItem        = signal<DevOpsWorkItem | null>(null);
  dragOverState   = signal<string | null>(null);
  saving          = signal<number | null>(null);
  selectedItem    = signal<DevOpsWorkItem | null>(null);

  ngOnInit(): void {
    this.ado.listProjects().subscribe({
      next: (res) => {
        this.projects.set(res.value);
        this.loading.set(false);
        if (res.value.length) this.selectProject(res.value[0].name);
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  selectProject(name: string): void {
    this.selectedProject.set(name);
    this.boardLoading.set(true);
    this.columns.set([]);
    const wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${name}' ORDER BY [System.ChangedDate] DESC`;
    this.ado.queryWorkItems(name, wiql).subscribe({
      next: (res) => {
        const ids = res.workItems?.slice(0, 50).map((w) => w.id) ?? [];
        if (!ids.length) { this.buildColumns([]); return; }
        this.ado.listWorkItems(name, ids).subscribe({
          next: (items) => this.buildColumns(items.value),
          error: () => this.boardLoading.set(false),
        });
      },
      error: (e) => { this.error.set(e?.message); this.boardLoading.set(false); },
    });
  }

  openItem(wi: DevOpsWorkItem): void {
    this.selectedItem.set(wi);
  }

  closePanel(): void {
    this.selectedItem.set(null);
  }

  private buildColumns(items: DevOpsWorkItem[]): void {
    this.columns.set(STATES.map((state) => ({
      state,
      items: items.filter((i) => i.fields['System.State'] === state),
    })));
    this.boardLoading.set(false);
  }

  onDragStart(event: DragEvent, item: DevOpsWorkItem): void {
    this.dragItem.set(item);
    event.dataTransfer?.setData('text/plain', String(item.id));
    (event.currentTarget as HTMLElement).classList.add('dragging');
  }

  onDragEnd(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('dragging');
    this.dragOverState.set(null);
  }

  onDragEnter(state: string): void {
    this.dragOverState.set(state);
  }

  onDragLeave(event: DragEvent): void {
    const col = event.currentTarget as HTMLElement;
    if (!col.contains(event.relatedTarget as Node)) {
      this.dragOverState.set(null);
    }
  }

  onDrop(targetState: string): void {
    this.dragOverState.set(null);
    const item = this.dragItem();
    if (!item || item.fields['System.State'] === targetState) return;

    const project = this.selectedProject()!;
    const prevState = item.fields['System.State'];

    item.fields['System.State'] = targetState;
    this.buildColumns(this.columns().flatMap((c) => c.items));
    this.saving.set(item.id);

    this.ado.updateWorkItemState(project, item.id, targetState).subscribe({
      next: () => {
        this.saving.set(null);
        this.toasts.show(`#${item.id} → ${targetState}`, 'success', 2500);
      },
      error: (e) => {
        item.fields['System.State'] = prevState;
        this.buildColumns(this.columns().flatMap((c) => c.items));
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
