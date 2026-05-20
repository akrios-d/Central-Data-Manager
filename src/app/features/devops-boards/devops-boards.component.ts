import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { BoardsProviderService } from '../../core/services/boards-provider.service';
import { BoardProject, BoardWorkItem } from '../../core/interfaces/boards-provider.interface';
import { ToastService } from '../../shared/services/toast.service';
import { WorkItemPanelComponent } from '../../shared/components/work-item-panel/work-item-panel.component';

interface Column { state: string; items: BoardWorkItem[]; }
interface ColumnConfig { state: string; visible: boolean; }

@Component({
  selector: 'app-devops-boards',
  imports: [FormsModule, WorkItemPanelComponent, TranslateModule],
  templateUrl: './devops-boards.component.html',
  styleUrl: './devops-boards.component.scss',
})
export class DevopsBoardsComponent implements OnInit {
  private readonly boards    = inject(BoardsProviderService);
  private readonly toasts    = inject(ToastService);
  private readonly translate = inject(TranslateService);

  projects        = signal<BoardProject[]>([]);
  selectedProject = signal<string | null>(null);
  columns         = signal<Column[]>([]);
  loading         = signal(true);
  boardLoading    = signal(false);
  boardReady      = signal(false);
  error           = signal<string | null>(null);
  dragItem        = signal<BoardWorkItem | null>(null);
  dragOverState   = signal<string | null>(null);
  saving          = signal<number | string | null>(null);
  selectedItem    = signal<BoardWorkItem | null>(null);

  teamMembers          = signal<string[]>([]);
  showAssigneeDrop     = signal(false);
  columnConfigs        = signal<ColumnConfig[]>([]);
  showColManager       = signal(false);
  availableTypes       = signal<string[]>([]);

  readonly assigneeSuggestions = computed(() => {
    const q = this.normalize(this.filterAssignee());
    if (!q) return this.teamMembers();
    return this.teamMembers().filter(m => this.normalize(m).includes(q));
  });

  private normalize(s: string): string {
    return s.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').toLowerCase();
  }

  readonly visibleColumns = computed(() =>
    this.columnConfigs()
      .filter(cfg => cfg.visible)
      .map(cfg => this.columns().find(col => col.state === cfg.state))
      .filter((c): c is Column => !!c)
  );

  filterTypes    = signal<Set<string>>(new Set());
  filterAssignee = signal('');
  filterSprint   = signal<'current' | 'all'>('all');

  readonly totalItems = computed(() => this.columns().reduce((s, c) => s + c.items.length, 0));

  private wasDragging = false;

  ngOnInit(): void {
    this.boards.listProjects().subscribe({
      next: (ps) => {
        this.projects.set(ps);
        this.loading.set(false);
        if (ps.length) {
          this.selectedProject.set(ps[0].id);
          this.loadAssignees(ps[0].id);
          this.loadSavedColConfig(ps[0].id);
        }
      },
      error: (e) => { this.error.set(e?.message); this.loading.set(false); },
    });
  }

  loadAssignees(projectId: string): void {
    this.boards.listAssignees(projectId).subscribe({
      next: (names) => this.teamMembers.set(names),
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
    const projectId = this.selectedProject();
    if (!projectId) return;
    this.boardLoading.set(true);
    this.boardReady.set(false);
    this.columns.set([]);

    this.boards.listWorkItems(projectId, {
      sprint: this.filterSprint(),
      types: [...this.filterTypes()],
      assignee: this.filterAssignee(),
      hiddenStates: this.columnConfigs().filter(c => !c.visible).map(c => c.state),
    }).subscribe({
      next: (items) => this.buildColumns(items),
      error: (e) => { this.error.set(e?.message); this.boardLoading.set(false); },
    });
  }

  private get colConfigKey(): string {
    return `cdm_col_cfg_${this.selectedProject()}`;
  }

  loadSavedColConfig(projectId: string): void {
    try {
      const key = `cdm_col_cfg_${projectId}`;
      const saved: ColumnConfig[] = JSON.parse(localStorage.getItem(key) ?? 'null');
      if (saved?.length) this.columnConfigs.set(saved);
      else this.columnConfigs.set([]);
    } catch {
      this.columnConfigs.set([]);
    }
  }

  private loadColConfig(states: string[]): ColumnConfig[] {
    try {
      const saved: ColumnConfig[] = JSON.parse(localStorage.getItem(this.colConfigKey) ?? 'null');
      if (!saved) return states.map(state => ({ state, visible: true }));
      const savedStates = new Set(saved.map(c => c.state));
      const newOnes = states.filter(s => !savedStates.has(s)).map(state => ({ state, visible: true }));
      return [...saved, ...newOnes];
    } catch {
      return states.map(state => ({ state, visible: true }));
    }
  }

  private saveColConfig(): void {
    localStorage.setItem(this.colConfigKey, JSON.stringify(this.columnConfigs()));
  }

  private buildColumns(items: BoardWorkItem[]): void {
    const preferred = ['New', 'Active', 'Resolved', 'Closed', 'To Do', 'In Progress', 'Done'];
    const allStates = [...new Set(items.map(i => i.state))];
    const ordered = [
      ...preferred.filter(s => allStates.includes(s)),
      ...allStates.filter(s => !preferred.includes(s)),
    ];
    this.columns.set(ordered.map(state => ({
      state,
      items: items.filter(i => i.state === state),
    })));
    this.columnConfigs.set(this.loadColConfig(ordered));
    this.availableTypes.set([...new Set(items.map(i => i.type))].sort());
    this.boardLoading.set(false);
    this.boardReady.set(true);
  }

  private rebucketItems(items: BoardWorkItem[]): void {
    this.columns.update(cols =>
      cols.map(col => ({ ...col, items: items.filter(i => i.state === col.state) }))
    );
  }

  dragColIndex      = signal<number | null>(null);
  dragColBoardState = signal<string | null>(null);

  toggleColVisibility(state: string): void {
    this.columnConfigs.update(cfgs =>
      cfgs.map(c => c.state === state ? { ...c, visible: !c.visible } : c)
    );
    this.saveColConfig();
  }

  onColDragStart(index: number): void { this.dragColIndex.set(index); }

  onColDragEnter(index: number): void {
    const from = this.dragColIndex();
    if (from === null || from === index) return;
    this.columnConfigs.update(cfgs => {
      const next = [...cfgs];
      const [item] = next.splice(from, 1);
      next.splice(index, 0, item);
      return next;
    });
    this.dragColIndex.set(index);
  }

  onColDragEnd(): void { this.dragColIndex.set(null); this.saveColConfig(); }

  onColBoardDragStart(event: DragEvent, state: string): void {
    this.dragColBoardState.set(state);
    event.stopPropagation();
  }

  private reorderColBoard(toState: string): void {
    const fromState = this.dragColBoardState();
    if (!fromState || fromState === toState) return;
    this.columnConfigs.update(cfgs => {
      const next = [...cfgs];
      const fromIdx = next.findIndex(c => c.state === fromState);
      const toIdx   = next.findIndex(c => c.state === toState);
      if (fromIdx === -1 || toIdx === -1) return cfgs;
      const [item] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, item);
      return next;
    });
    this.dragColBoardState.set(toState);
  }

  onColBoardDragEnd(): void { this.dragColBoardState.set(null); this.saveColConfig(); }

  resetColConfig(): void {
    this.toasts.confirm(
      this.translate.instant('boards.resetConfirmMsg'),
      this.translate.instant('boards.resetConfirmBtn'),
      () => {
        localStorage.removeItem(this.colConfigKey);
        this.columnConfigs.set([]);
        this.showColManager.set(false);
        this.loadBoard();
      }
    );
  }

  openItem(wi: BoardWorkItem): void {
    if (this.wasDragging) return;
    this.selectedItem.set(wi);
  }

  closePanel(): void { this.selectedItem.set(null); }

  onDragStart(event: DragEvent, item: BoardWorkItem): void {
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

  onDragEnter(state: string): void {
    if (this.dragColBoardState()) this.reorderColBoard(state);
    else this.dragOverState.set(state);
  }

  onDragLeave(event: DragEvent): void {
    if (this.dragColBoardState()) return;
    const col = event.currentTarget as HTMLElement;
    const related = event.relatedTarget as Node | null;
    if (!related || !col.contains(related)) this.dragOverState.set(null);
  }

  onDrop(targetState: string): void {
    if (this.dragColBoardState()) return;
    this.dragOverState.set(null);
    const item = this.dragItem();
    if (!item || item.state === targetState) return;

    const projectId  = this.selectedProject()!;
    const prevState  = item.state;
    item.state       = targetState;
    this.rebucketItems(this.columns().flatMap(c => c.items));
    this.saving.set(item.id);

    this.boards.updateItemState(projectId, item.id, targetState).subscribe({
      next: () => { this.saving.set(null); this.toasts.show(`#${item.id} → ${targetState}`, 'success', 2500); },
      error: (e) => {
        item.state = prevState;
        this.rebucketItems(this.columns().flatMap(c => c.items));
        this.saving.set(null);
        this.toasts.show(e?.message ?? e?.error?.message ?? 'Failed to update', 'danger');
      },
    });
    this.dragItem.set(null);
  }
}
