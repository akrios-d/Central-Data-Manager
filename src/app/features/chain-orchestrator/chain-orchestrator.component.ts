import {
  Component,
  ElementRef,
  HostListener,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { Chain } from '../../core/models/chain.model';
import { OrchEdge, OrchGraph, OrchNode, NodeRunStatus } from '../../core/models/orchestrator.model';
import { OrchestratorService } from '../../core/services/orchestrator.service';
import { OrchestratorExecutorService } from '../../core/services/orchestrator-executor.service';
import { ChainService } from '../../core/services/chain.service';
import { ToastService } from '../../shared/services/toast.service';

// Node visual dimensions (must match SCSS)
const NODE_W = 200;
const NODE_H = 72;
const START_W = 90;
const START_H = 40;

type Interaction =
  | { type: 'dragging-node'; nodeId: string; offsetX: number; offsetY: number }
  | {
      type: 'drawing-edge';
      fromNodeId: string;
      fromX: number;
      fromY: number;
      curX: number;
      curY: number;
    };

@Component({
  selector: 'app-chain-orchestrator',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslateModule],
  templateUrl: './chain-orchestrator.component.html',
  styleUrl: './chain-orchestrator.component.scss',
})
export class ChainOrchestratorComponent {
  private readonly orchSvc = inject(OrchestratorService);
  private readonly executor = inject(OrchestratorExecutorService);
  private readonly chainSvc = inject(ChainService);
  private readonly toasts = inject(ToastService);

  @ViewChild('canvasWrapper') canvasWrapperRef!: ElementRef<HTMLDivElement>;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLDivElement>;

  // ── Data ──────────────────────────────────────────────────────────────────────
  readonly allGraphs = this.orchSvc.graphs;
  readonly allChains = this.chainSvc.chains;
  readonly activeRun = this.executor.activeRun;

  // ── Navigation ────────────────────────────────────────────────────────────────
  activeTab = signal<'graphs' | 'canvas' | 'history'>('graphs');

  // ── Graph editor state ────────────────────────────────────────────────────────
  selectedGraphId = signal<string | null>(null);
  graphName = signal('');
  graphNodes = signal<OrchNode[]>([]);
  graphEdges = signal<OrchEdge[]>([]);

  // ── Canvas interaction ────────────────────────────────────────────────────────
  interaction = signal<Interaction | null>(null);
  hoveredInPortNodeId = signal<string | null>(null);
  selectedNodeId = signal<string | null>(null);
  selectedEdgeId = signal<string | null>(null);
  private mouseDownPos = { x: 0, y: 0 };

  // ── Node popup ────────────────────────────────────────────────────────────────
  selectedNodePopupId = signal<string | null>(null);

  readonly popupNode = computed(() => {
    const id = this.selectedNodePopupId();
    return id ? (this.graphNodes().find((n) => n.id === id) ?? null) : null;
  });

  readonly popupSteps = computed(() => {
    const node = this.popupNode();
    if (!node?.chainId) return [];
    return this.allChains().find((c) => c.id === node.chainId)?.steps ?? [];
  });

  // ── Graph search ──────────────────────────────────────────────────────────────
  graphSearch = signal('');

  // ── Add-chain panel ───────────────────────────────────────────────────────────
  showAddChain = signal(false);
  chainSearch = signal('');

  // ── Run state ─────────────────────────────────────────────────────────────────
  running = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly selectedGraph = computed(() => {
    const id = this.selectedGraphId();
    return id && id !== 'new' ? (this.allGraphs().find((g) => g.id === id) ?? null) : null;
  });

  readonly graphRuns = computed(() => {
    const id = this.selectedGraphId();
    return id && id !== 'new' ? this.orchSvc.runs().filter((r) => r.graphId === id) : [];
  });

  readonly filteredGraphs = computed(() => {
    const q = this.graphSearch().toLowerCase().trim();
    return q ? this.allGraphs().filter((g) => g.name.toLowerCase().includes(q)) : this.allGraphs();
  });

  readonly filteredChains = computed(() => {
    const q = this.chainSearch().toLowerCase().trim();
    return q ? this.allChains().filter((c) => c.name.toLowerCase().includes(q)) : this.allChains();
  });

  readonly isActiveGraph = computed(() => {
    const run = this.activeRun();
    return !!run && run.graphId === this.selectedGraphId();
  });

  readonly isRunning = computed(
    () => this.running() || (this.isActiveGraph() && this.activeRun()?.status === 'running'),
  );

  readonly canRun = computed(
    () =>
      !this.isRunning() &&
      !!this.selectedGraphId() &&
      this.selectedGraphId() !== 'new' &&
      this.graphNodes().some((n) => n.type !== 'start'),
  );

  // ── Graph list ────────────────────────────────────────────────────────────────
  newGraph(): void {
    const startNode: OrchNode = { id: crypto.randomUUID(), type: 'start', x: 60, y: 200 };
    this.selectedGraphId.set('new');
    this.graphName.set('');
    this.graphNodes.set([startNode]);
    this.graphEdges.set([]);
    this.activeTab.set('canvas');
  }

  selectGraph(graph: OrchGraph): void {
    this.selectedGraphId.set(graph.id);
    this.graphName.set(graph.name);
    this.graphNodes.set(graph.nodes.map((n) => ({ ...n })));
    this.graphEdges.set(graph.edges.map((e) => ({ ...e })));
    this.activeTab.set('canvas');
  }

  // ── Editor ────────────────────────────────────────────────────────────────────
  saveGraph(): void {
    const name = this.graphName().trim();
    if (!name) {
      this.toasts.show('Graph name is required', 'danger');
      return;
    }
    const currentId = this.selectedGraphId();
    const id = currentId === 'new' || !currentId ? crypto.randomUUID() : currentId;
    const graph: OrchGraph = {
      id,
      name,
      nodes: this.graphNodes(),
      edges: this.graphEdges(),
      createdAt: this.selectedGraph()?.createdAt ?? new Date().toISOString(),
    };
    this.orchSvc.saveGraph(graph);
    this.selectedGraphId.set(id);
    this.toasts.show('Graph saved', 'success');
  }

  deleteGraph(): void {
    const id = this.selectedGraphId();
    if (!id || id === 'new') return;
    this.toasts.confirm(`Delete "${this.graphName()}"?`, 'Delete', () => {
      this.orchSvc.deleteGraph(id);
      this.selectedGraphId.set(null);
      this.graphNodes.set([]);
      this.graphEdges.set([]);
      this.activeTab.set('graphs');
    });
  }

  // ── Add chain node ────────────────────────────────────────────────────────────
  toggleAddChain(): void {
    this.showAddChain.update((v) => !v);
    this.chainSearch.set('');
  }

  addChainNode(chain: Chain): void {
    const wrapper = this.canvasWrapperRef?.nativeElement;
    const stagger = this.graphNodes().filter((n) => n.type === 'chain').length;
    const x = wrapper
      ? Math.round(wrapper.scrollLeft + wrapper.clientWidth / 2 - NODE_W / 2 + stagger * 12)
      : 400;
    const y = wrapper ? Math.round(wrapper.scrollTop + 140 + stagger * 24) : 200 + stagger * 24;
    this.graphNodes.update((ns) => [
      ...ns,
      {
        id: crypto.randomUUID(),
        type: 'chain',
        chainId: chain.id,
        label: chain.name,
        x,
        y,
      },
    ]);
    this.showAddChain.set(false);
  }

  removeNode(nodeId: string, e?: MouseEvent): void {
    e?.stopPropagation();
    const startId = this.graphNodes().find((n) => n.type === 'start')?.id;
    if (nodeId === startId) return;
    this.graphNodes.update((ns) => ns.filter((n) => n.id !== nodeId));
    this.graphEdges.update((es) => es.filter((e) => e.fromId !== nodeId && e.toId !== nodeId));
    if (this.selectedNodeId() === nodeId) this.selectedNodeId.set(null);
  }

  toggleNodeDisabled(nodeId: string, e?: MouseEvent): void {
    e?.stopPropagation();
    this.graphNodes.update((ns) =>
      ns.map((n) => (n.id === nodeId ? { ...n, disabled: !n.disabled } : n)),
    );
  }

  // ── Canvas events ─────────────────────────────────────────────────────────────
  onCanvasMouseDown(_e: MouseEvent): void {
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.showAddChain.set(false);
    this.selectedNodePopupId.set(null);
  }

  onCanvasKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.selectedNodeId.set(null);
      this.selectedEdgeId.set(null);
      this.showAddChain.set(false);
      this.selectedNodePopupId.set(null);
    }
  }

  onNodeKeyDown(e: KeyboardEvent, node: OrchNode): void {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (node.type !== 'start') this.selectedNodePopupId.set(node.id);
    }
  }

  onNodeMouseDown(e: MouseEvent, node: OrchNode): void {
    e.stopPropagation();
    this.mouseDownPos = { x: e.clientX, y: e.clientY };
    this.selectedNodeId.set(node.id);
    this.selectedEdgeId.set(null);
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);
    this.interaction.set({
      type: 'dragging-node',
      nodeId: node.id,
      offsetX: x - node.x,
      offsetY: y - node.y,
    });
  }

  onNodeTouchStart(e: TouchEvent, node: OrchNode): void {
    e.stopPropagation();
    const touch = e.touches[0];
    this.selectedNodeId.set(node.id);
    this.selectedEdgeId.set(null);
    this.selectedNodePopupId.set(null);
    const { x, y } = this.clientToCanvas(touch.clientX, touch.clientY);
    this.interaction.set({
      type: 'dragging-node',
      nodeId: node.id,
      offsetX: x - node.x,
      offsetY: y - node.y,
    });
  }

  onCanvasTouchStart(_e: TouchEvent): void {
    this.selectedNodeId.set(null);
    this.selectedEdgeId.set(null);
    this.showAddChain.set(false);
    this.selectedNodePopupId.set(null);
  }

  onNodeClick(e: MouseEvent, node: OrchNode): void {
    e.stopPropagation();
    if (node.type === 'start') return;
    if (
      Math.abs(e.clientX - this.mouseDownPos.x) > 5 ||
      Math.abs(e.clientY - this.mouseDownPos.y) > 5
    )
      return;
    this.selectedNodePopupId.set(node.id);
  }

  closeNodePopup(): void {
    this.selectedNodePopupId.set(null);
  }

  toggleStepDisabled(nodeId: string, stepId: string): void {
    this.graphNodes.update((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const ds = n.disabledSteps ?? [];
        return {
          ...n,
          disabledSteps: ds.includes(stepId) ? ds.filter((id) => id !== stepId) : [...ds, stepId],
        };
      }),
    );
  }

  isStepDisabled(nodeId: string, stepId: string): boolean {
    return (
      this.graphNodes()
        .find((n) => n.id === nodeId)
        ?.disabledSteps?.includes(stepId) ?? false
    );
  }

  onOutPortMouseDown(e: MouseEvent, node: OrchNode): void {
    e.stopPropagation();
    this.startDrawingEdge(node);
  }

  onOutPortTouchStart(e: TouchEvent, node: OrchNode): void {
    e.stopPropagation();
    e.preventDefault();
    this.startDrawingEdge(node);
  }

  private startDrawingEdge(node: OrchNode): void {
    const w = node.type === 'start' ? START_W : NODE_W;
    const h = node.type === 'start' ? START_H : NODE_H;
    this.interaction.set({
      type: 'drawing-edge',
      fromNodeId: node.id,
      fromX: node.x + w,
      fromY: node.y + h / 2,
      curX: node.x + w,
      curY: node.y + h / 2,
    });
  }

  onEdgeClick(edgeId: string, e: Event): void {
    e.stopPropagation();
    this.selectedEdgeId.set(edgeId === this.selectedEdgeId() ? null : edgeId);
    this.selectedNodeId.set(null);
  }

  // ── Export / Import ───────────────────────────────────────────────────────────
  exportGraph(): void {
    const name = this.graphName().trim() || 'graph';
    const currentId = this.selectedGraphId();
    const graph: OrchGraph = {
      id: currentId === 'new' || !currentId ? crypto.randomUUID() : currentId,
      name,
      nodes: this.graphNodes(),
      edges: this.graphEdges(),
      createdAt: this.selectedGraph()?.createdAt ?? new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(graph, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph-${name.replaceAll(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async importGraph(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data?.name || !Array.isArray(data?.nodes) || !Array.isArray(data?.edges)) {
        this.toasts.show('Invalid graph file', 'danger');
        return;
      }
      const idMap = new Map<string, string>();
      const newId = (old: string): string => {
        const existing = idMap.get(old);
        if (existing) return existing;
        const fresh = crypto.randomUUID();
        idMap.set(old, fresh);
        return fresh;
      };
      const graph: OrchGraph = {
        id: crypto.randomUUID(),
        name: data.name,
        nodes: (data.nodes as OrchNode[]).map((n) => ({ ...n, id: newId(n.id) })),
        edges: (data.edges as OrchEdge[]).map((e) => ({
          ...e,
          id: crypto.randomUUID(),
          fromId: newId(e.fromId),
          toId: newId(e.toId),
        })),
        createdAt: new Date().toISOString(),
      };
      this.orchSvc.saveGraph(graph);
      this.selectGraph(graph);
      this.toasts.show(`Graph "${graph.name}" imported`, 'success');
    } catch {
      this.toasts.show('Could not read file', 'danger');
    }
    input.value = '';
  }

  // ── Global mouse handlers ─────────────────────────────────────────────────────
  @HostListener('document:mousemove', ['$event'])
  onDocMouseMove(e: MouseEvent): void {
    const mode = this.interaction();
    if (!mode) return;
    const { x, y } = this.clientToCanvas(e.clientX, e.clientY);

    if (mode.type === 'dragging-node') {
      const nx = Math.max(0, x - mode.offsetX);
      const ny = Math.max(0, y - mode.offsetY);
      this.graphNodes.update((ns) =>
        ns.map((n) => (n.id === mode.nodeId ? { ...n, x: nx, y: ny } : n)),
      );
    } else if (mode.type === 'drawing-edge') {
      this.interaction.set({ ...mode, curX: x, curY: y });
    }
  }

  @HostListener('document:mouseup')
  onDocMouseUp(): void {
    this.commitEdgeIfPossible();
    this.interaction.set(null);
  }

  @HostListener('document:touchmove', ['$event'])
  onDocTouchMove(e: TouchEvent): void {
    const mode = this.interaction();
    if (!mode) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = this.clientToCanvas(touch.clientX, touch.clientY);

    if (mode.type === 'dragging-node') {
      const nx = Math.max(0, x - mode.offsetX);
      const ny = Math.max(0, y - mode.offsetY);
      this.graphNodes.update((ns) =>
        ns.map((n) => (n.id === mode.nodeId ? { ...n, x: nx, y: ny } : n)),
      );
    } else if (mode.type === 'drawing-edge') {
      this.interaction.set({ ...mode, curX: x, curY: y });
      // Detect in-port under the finger via elementFromPoint
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const portNodeId =
        el?.getAttribute('data-port-in-node-id') ??
        el?.closest('[data-port-in-node-id]')?.getAttribute('data-port-in-node-id') ??
        null;
      this.hoveredInPortNodeId.set(portNodeId);
    }
  }

  @HostListener('document:touchend')
  onDocTouchEnd(): void {
    this.commitEdgeIfPossible();
    this.hoveredInPortNodeId.set(null);
    this.interaction.set(null);
  }

  private commitEdgeIfPossible(): void {
    const mode = this.interaction();
    if (mode?.type !== 'drawing-edge') return;
    const targetId = this.hoveredInPortNodeId();
    if (!targetId || targetId === mode.fromNodeId) return;
    if (this.wouldCreateCycle(mode.fromNodeId, targetId)) {
      this.toasts.show('Cannot connect — this would create a cycle', 'danger');
      return;
    }
    const dup = this.graphEdges().some((e) => e.fromId === mode.fromNodeId && e.toId === targetId);
    if (!dup) {
      this.graphEdges.update((es) => [
        ...es,
        { id: crypto.randomUUID(), fromId: mode.fromNodeId, toId: targetId },
      ]);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onDocKeyDown(e: KeyboardEvent): void {
    if (this.activeTab() !== 'canvas') return;
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

    if (e.key === 'Escape') {
      this.selectedNodeId.set(null);
      this.selectedEdgeId.set(null);
      this.showAddChain.set(false);
      this.selectedNodePopupId.set(null);
      return;
    }

    if (e.key !== 'Delete') return;

    const nodeId = this.selectedNodeId();
    const edgeId = this.selectedEdgeId();
    const startId = this.graphNodes().find((n) => n.type === 'start')?.id;

    if (nodeId && nodeId !== startId) {
      this.removeNode(nodeId);
    } else if (edgeId) {
      this.graphEdges.update((es) => es.filter((e) => e.id !== edgeId));
      this.selectedEdgeId.set(null);
    }
  }

  @HostListener('document:click')
  onDocClick(): void {
    this.showAddChain.set(false);
  }

  // ── Run ───────────────────────────────────────────────────────────────────────
  async runGraph(): Promise<void> {
    if (!this.canRun()) return;
    const currentId = this.selectedGraphId();
    const id = currentId === 'new' || !currentId ? crypto.randomUUID() : currentId;
    const graph: OrchGraph = {
      id,
      name: this.graphName().trim() || 'Untitled',
      nodes: this.graphNodes(),
      edges: this.graphEdges(),
      createdAt: this.selectedGraph()?.createdAt ?? new Date().toISOString(),
    };
    this.orchSvc.saveGraph(graph);
    this.selectedGraphId.set(id);
    this.running.set(true);
    try {
      await this.executor.execute(graph, this.allChains());
    } finally {
      this.running.set(false);
    }
  }

  stopGraph(): void {
    this.executor.stop();
  }

  // ── SVG helpers ───────────────────────────────────────────────────────────────
  getEdgePath(edge: OrchEdge): string {
    const from = this.graphNodes().find((n) => n.id === edge.fromId);
    const to = this.graphNodes().find((n) => n.id === edge.toId);
    if (!from || !to) return '';
    return this.bezier(this.portOut(from), this.portIn(to));
  }

  getTempEdgePath(): string {
    const mode = this.interaction();
    if (mode?.type !== 'drawing-edge') return '';
    return this.bezier({ x: mode.fromX, y: mode.fromY }, { x: mode.curX, y: mode.curY });
  }

  private bezier(from: { x: number; y: number }, to: { x: number; y: number }): string {
    const dx = Math.max(60, Math.abs(to.x - from.x) * 0.5);
    return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y} ${to.x - dx} ${to.y} ${to.x} ${to.y}`;
  }

  private portOut(n: OrchNode): { x: number; y: number } {
    const w = n.type === 'start' ? START_W : NODE_W;
    const h = n.type === 'start' ? START_H : NODE_H;
    return { x: n.x + w, y: n.y + h / 2 };
  }

  private portIn(n: OrchNode): { x: number; y: number } {
    const h = n.type === 'start' ? START_H : NODE_H;
    return { x: n.x, y: n.y + h / 2 };
  }

  private clientToCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const el = this.canvasRef?.nativeElement;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  }

  private wouldCreateCycle(fromId: string, toId: string): boolean {
    const visited = new Set<string>();
    const edges = this.graphEdges();
    const dfs = (id: string): boolean => {
      if (id === fromId) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      return edges.filter((e) => e.fromId === id).some((e) => dfs(e.toId));
    };
    return dfs(toId);
  }

  // ── Template helpers ──────────────────────────────────────────────────────────
  getNodeRunStatus(nodeId: string): NodeRunStatus {
    if (!this.isActiveGraph()) return 'idle';
    return this.activeRun()?.nodes.find((n) => n.nodeId === nodeId)?.status ?? 'idle';
  }

  nodeStatusIcon(s: NodeRunStatus): string {
    return (
      (
        { idle: '○', running: '◌', success: '✓', failure: '✕', skipped: '–' } as Record<
          string,
          string
        >
      )[s] ?? '○'
    );
  }

  getChainStepCount(chainId?: string): string {
    if (!chainId) return '';
    const chain = this.allChains().find((c) => c.id === chainId);
    if (!chain) return '';
    const count = chain.steps.length;
    return `${count} step${count === 1 ? '' : 's'}`;
  }

  runStatusColor(status: string): string {
    return (
      (
        { running: 'info', success: 'success', failure: 'danger', stopped: 'muted' } as Record<
          string,
          string
        >
      )[status] ?? 'muted'
    );
  }

  isDrawingEdge(): boolean {
    return this.interaction()?.type === 'drawing-edge';
  }

  getNodeLabel(nodeId: string): string {
    return this.graphNodes().find((n) => n.id === nodeId)?.label ?? nodeId.slice(0, 6);
  }
}
