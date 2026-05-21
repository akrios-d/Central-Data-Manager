import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BoardsProviderService } from '../../core/services/boards-provider.service';
import { TokenService } from '../../core/services/token.service';
import { BoardProject, BoardWorkItem } from '../../core/interfaces/boards-provider.interface';

const NODE_W = 260;
const NODE_H = 72;
const H_GAP = 96;
const V_GAP = 12;
const CANVAS_PAD = 48;

interface BNode {
  id: number | string;
  item: BoardWorkItem;
  x: number;
  y: number;
  level: number;
  impactScore: number;
  blocks: (number | string)[];
  blockedBy: (number | string)[];
}

interface BEdge {
  id: string;
  fromId: number | string;
  toId: number | string;
}

@Component({
  selector: 'app-blockers',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule],
  templateUrl: './blockers.component.html',
  styleUrl: './blockers.component.scss',
})
export class BlockersComponent implements OnInit {
  private readonly boardsProvider = inject(BoardsProviderService);
  private readonly tokens = inject(TokenService);

  readonly NODE_W = NODE_W;
  readonly NODE_H = NODE_H;

  projects = signal<BoardProject[]>([]);
  selectedProject = signal('');
  loadingProjects = signal(false);
  loading = signal(false);
  error = signal('');

  nodes = signal<BNode[]>([]);
  edges = signal<BEdge[]>([]);
  selectedNodeId = signal<number | string | null>(null);
  canvasWidth = signal(800);
  canvasHeight = signal(500);

  filterTypes = signal<Set<string>>(new Set());
  filterStates = signal<Set<string>>(new Set());
  filterOnlyBlockers = signal(false);

  availableTypes = computed(() => [...new Set(this.nodes().map((n) => n.item.type))].sort((a, b) => a.localeCompare(b)));
  availableStates = computed(() => [...new Set(this.nodes().map((n) => n.item.state))].sort((a, b) => a.localeCompare(b)));

  filteredNodes = computed(() => {
    const types = this.filterTypes();
    const states = this.filterStates();
    const onlyBlockers = this.filterOnlyBlockers();
    return this.nodes().filter((n) => {
      if (types.size > 0 && !types.has(n.item.type)) return false;
      if (states.size > 0 && !states.has(n.item.state)) return false;
      if (onlyBlockers && n.blocks.length === 0) return false;
      return true;
    });
  });

  filteredNodeIds = computed(() => new Set(this.filteredNodes().map((n) => n.id)));

  filteredEdges = computed(() => {
    const ids = this.filteredNodeIds();
    return this.edges().filter((e) => ids.has(e.fromId) && ids.has(e.toId));
  });

  hasActiveFilters = computed(
    () => this.filterTypes().size > 0 || this.filterStates().size > 0 || this.filterOnlyBlockers(),
  );

  nodeById = computed(() => new Map(this.nodes().map((n) => [n.id, n])));

  selectedNode = computed(() => this.nodeById().get(this.selectedNodeId()!) ?? null);

  topBlockers = computed(() =>
    [...this.filteredNodes()]
      .filter((n) => n.blocks.length > 0)
      .sort((a, b) => b.impactScore - a.impactScore),
  );

  affectedNodes = computed((): Map<number | string, 'direct' | 'indirect'> => {
    const selectedId = this.selectedNodeId();
    if (selectedId == null) return new Map();
    const byId = this.nodeById();
    const result = new Map<number | string, 'direct' | 'indirect'>();
    const queue: { id: number | string; hop: number }[] = [{ id: selectedId, hop: 0 }];
    const visited = new Set<number | string>([selectedId]);
    let qi = 0;
    while (qi < queue.length) {
      const { id, hop } = queue[qi++];
      const node = byId.get(id);
      if (!node) continue;
      for (const nextId of node.blocks) {
        if (!visited.has(nextId)) {
          visited.add(nextId);
          result.set(nextId, hop === 0 ? 'direct' : 'indirect');
          queue.push({ id: nextId, hop: hop + 1 });
        }
      }
    }
    return result;
  });

  readonly hasProvider = computed(() =>
    this.boardsProvider.provider === 'jira' ? this.tokens.hasJira() : this.tokens.hasDevOps(),
  );

  readonly noProviderKey = computed(() =>
    this.boardsProvider.provider === 'jira' ? 'blockers.noJira' : 'blockers.noDevops',
  );

  ngOnInit(): void {
    if (this.hasProvider()) void this.fetchProjects();
  }

  async fetchProjects() {
    this.loadingProjects.set(true);
    try {
      const ps = await firstValueFrom(this.boardsProvider.listProjects());
      this.projects.set(ps);
      if (ps.length) this.selectedProject.set(ps[0].id);
    } catch {
      /* ignore */
    } finally {
      this.loadingProjects.set(false);
    }
  }

  async load() {
    const project = this.selectedProject();
    if (!project) return;

    this.loading.set(true);
    this.error.set('');
    this.nodes.set([]);
    this.edges.set([]);
    this.selectedNodeId.set(null);

    try {
      const { items, relations } = await firstValueFrom(this.boardsProvider.loadBlockers(project));

      if (!relations.length) {
        this.loading.set(false);
        return;
      }

      const allIds = [...items.keys()];

      const blocks = new Map<number | string, Set<number | string>>(
        allIds.map((id) => [id, new Set()]),
      );
      const blockedBy = new Map<number | string, Set<number | string>>(
        allIds.map((id) => [id, new Set()]),
      );

      const edgeSeen = new Set<string>();
      const rawEdges: BEdge[] = [];
      for (const r of relations) {
        const key = `${r.sourceId}-${r.targetId}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        blocks.get(r.sourceId)?.add(r.targetId);
        blockedBy.get(r.targetId)?.add(r.sourceId);
        rawEdges.push({ id: key, fromId: r.sourceId, toId: r.targetId });
      }

      // Level assignment via DFS memoization (handles cycles)
      const levels = new Map<number | string, number>();
      const getLevel = (id: number | string, visiting: Set<number | string>): number => {
        if (levels.has(id)) return levels.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const preds = [...(blockedBy.get(id) ?? [])];
        const level = preds.length ? Math.max(...preds.map((p) => getLevel(p, visiting) + 1)) : 0;
        visiting.delete(id);
        levels.set(id, level);
        return level;
      };
      for (const id of allIds) getLevel(id, new Set());

      // Group by level for vertical stacking
      const levelGroups = new Map<number, (number | string)[]>();
      for (const [id, lvl] of levels) {
        if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
        levelGroups.get(lvl)!.push(id);
      }

      // Impact score: transitive count of blocked items
      const computeImpact = (startId: number | string): number => {
        const visited = new Set<number | string>();
        const stack = [...(blocks.get(startId) ?? [])];
        while (stack.length) {
          const id = stack.pop()!;
          if (visited.has(id)) continue;
          visited.add(id);
          for (const next of blocks.get(id) ?? []) stack.push(next);
        }
        return visited.size;
      };
      const impacts = new Map<number | string, number>();
      for (const id of allIds) impacts.set(id, computeImpact(id));

      for (const ids of levelGroups.values()) {
        ids.sort((a, b) => (impacts.get(b) ?? 0) - (impacts.get(a) ?? 0));
      }

      const positions = new Map<number | string, { x: number; y: number }>();
      for (const [lvl, ids] of levelGroups) {
        ids.forEach((id, i) => {
          positions.set(id, {
            x: CANVAS_PAD + lvl * (NODE_W + H_GAP),
            y: CANVAS_PAD + i * (NODE_H + V_GAP),
          });
        });
      }

      const xs = [...positions.values()].map((p) => p.x);
      const ys = [...positions.values()].map((p) => p.y);
      this.canvasWidth.set(Math.max(...xs) + NODE_W + CANVAS_PAD);
      this.canvasHeight.set(Math.max(...ys) + NODE_H + CANVAS_PAD);

      const bNodes: BNode[] = allIds
        .filter((id) => items.has(id) && positions.has(id))
        .map((id) => ({
          id,
          item: items.get(id)!,
          x: positions.get(id)!.x,
          y: positions.get(id)!.y,
          level: levels.get(id)!,
          impactScore: impacts.get(id)!,
          blocks: [...(blocks.get(id) ?? [])],
          blockedBy: [...(blockedBy.get(id) ?? [])],
        }));

      this.nodes.set(bNodes);
      this.edges.set(rawEdges);
    } catch (e: any) {
      this.error.set(e?.message ?? 'Error loading graph');
    } finally {
      this.loading.set(false);
    }
  }

  getEdgePath(edge: BEdge): string {
    const map = this.nodeById();
    const from = map.get(edge.fromId);
    const to = map.get(edge.toId);
    if (!from || !to) return '';
    const x1 = from.x + NODE_W,
      y1 = from.y + NODE_H / 2;
    const x2 = to.x,
      y2 = to.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`;
  }

  toggleTypeFilter(type: string): void {
    this.filterTypes.update((s) => {
      const n = new Set(s);
      n.has(type) ? n.delete(type) : n.add(type);
      return n;
    });
  }

  toggleStateFilter(state: string): void {
    this.filterStates.update((s) => {
      const n = new Set(s);
      n.has(state) ? n.delete(state) : n.add(state);
      return n;
    });
  }

  clearFilters(): void {
    this.filterTypes.set(new Set());
    this.filterStates.set(new Set());
    this.filterOnlyBlockers.set(false);
  }

  isEdgeInSubgraph(edge: BEdge): boolean {
    const selectedId = this.selectedNodeId();
    if (selectedId == null) return false;
    const affected = this.affectedNodes();
    return (edge.fromId === selectedId || affected.has(edge.fromId)) && affected.has(edge.toId);
  }

  selectNode(id: number | string): void {
    this.selectedNodeId.set(this.selectedNodeId() === id ? null : id);
  }

  itemTitle(id: number | string): string {
    return this.nodeById().get(id)?.item.title ?? `#${id}`;
  }

  typeColor(type: string): string {
    switch ((type ?? '').toLowerCase()) {
      case 'epic':
        return '#a371f7';
      case 'feature':
        return '#58a6ff';
      case 'user story':
        return '#3fb950';
      case 'story':
        return '#3fb950';
      case 'task':
        return '#f0883e';
      case 'bug':
        return '#f85149';
      default:
        return '#8b949e';
    }
  }
}
