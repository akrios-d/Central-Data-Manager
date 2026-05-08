import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DevOpsApiService, DevOpsProject, DevOpsWorkItem } from '../../core/services/devops-api.service';

const STATES = ['New', 'Active', 'Resolved', 'Closed'];

interface Column {
  state: string;
  items: DevOpsWorkItem[];
}

@Component({
  selector: 'app-devops-boards',
  imports: [FormsModule],
  templateUrl: './devops-boards.component.html',
  styleUrl: './devops-boards.component.scss',
})
export class DevopsBoardsComponent implements OnInit {
  private ado = inject(DevOpsApiService);

  projects = signal<DevOpsProject[]>([]);
  selectedProject = signal<string | null>(null);
  columns = signal<Column[]>([]);
  loading = signal(true);
  boardLoading = signal(false);
  error = signal<string | null>(null);
  dragItem = signal<DevOpsWorkItem | null>(null);

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

  private buildColumns(items: DevOpsWorkItem[]): void {
    const cols: Column[] = STATES.map((state) => ({
      state,
      items: items.filter((i) => i.fields['System.State'] === state),
    }));
    this.columns.set(cols);
    this.boardLoading.set(false);
  }

  onDragStart(item: DevOpsWorkItem): void {
    this.dragItem.set(item);
  }

  onDrop(targetState: string): void {
    const item = this.dragItem();
    if (!item || item.fields['System.State'] === targetState) return;
    const project = this.selectedProject()!;
    this.ado.updateWorkItemState(project, item.id, targetState).subscribe({
      next: () => {
        item.fields['System.State'] = targetState;
        this.buildColumns(this.columns().flatMap((c) => c.items));
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
