import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { FormsModule } from '@angular/forms';
import { DevOpsApiService, DevOpsProject, DevOpsWorkItem } from '../../core/services/devops-api.service';
import { TokenService } from '../../core/services/token.service';
import { firstValueFrom } from 'rxjs';

const NODE_W = 260;
const NODE_H = 72;
const H_GAP = 96;
const V_GAP = 12;
const CANVAS_PAD = 48;

interface BNode {
  id: number;
  item: DevOpsWorkItem;
  x: number;
  y: number;
  level: number;
  impactScore: number;
  blocks: number[];
  blockedBy: number[];
}

interface BEdge {
  id: string;
  fromId: number;
  toId: number;
}

@Component({
  selector: 'app-blockers',
  standalone: true,
  imports: [CommonModule, TranslateModule, FormsModule],
  templateUrl: './blockers.component.html',
  styleUrl: './blockers.component.scss',
})
export class BlockersComponent implements OnInit {
  private devops = inject(DevOpsApiService);
  private tokens = inject(TokenService);

  readonly NODE_W = NODE_W;
  readonly NODE_H = NODE_H;

  projects = signal<DevOpsProject[]>([]);
  selectedProject = signal('');
  loadingProjects = signal(false);
  loading = signal(false);
  error = signal('');

  nodes = signal<BNode[]>([]);
  edges = signal<BEdge[]>([]);
  selectedNodeId = signal<number | null>(null);
  canvasWidth = signal(800);
  canvasHeight = signal(500);

  // ── Filters ───────────────────────────────────────────────────────────────
  filterTypes        = signal<Set<string>>(new Set());
  filterStates       = signal<Set<string>>(new Set());
  filterOnlyBlockers = signal(false);

  availableTypes  = computed(() => [...new Set(this.nodes().map(n => n.item.fields['System.WorkItemType']))].sort());
  availableStates = computed(() => [...new Set(this.nodes().map(n => n.item.fields['System.State']))].sort());

  filteredNodes = computed(() => {
    const types        = this.filterTypes();
    const states       = this.filterStates();
    const onlyBlockers = this.filterOnlyBlockers();
    return this.nodes().filter(n => {
      if (types.size  > 0 && !types.has(n.item.fields['System.WorkItemType'])) return false;
      if (states.size > 0 && !states.has(n.item.fields['System.State']))       return false;
      if (onlyBlockers && n.blocks.length === 0)                                return false;
      return true;
    });
  });

  filteredNodeIds = computed(() => new Set(this.filteredNodes().map(n => n.id)));

  filteredEdges = computed(() => {
    const ids = this.filteredNodeIds();
    return this.edges().filter(e => ids.has(e.fromId) && ids.has(e.toId));
  });

  hasActiveFilters = computed(() =>
    this.filterTypes().size > 0 || this.filterStates().size > 0 || this.filterOnlyBlockers()
  );

  // ── Node map (all nodes — needed for positions & BFS even when filtered) ──
  nodeById = computed(() => new Map(this.nodes().map(n => [n.id, n])));

  selectedNode = computed(() => this.nodeById().get(this.selectedNodeId()!) ?? null);

  topBlockers = computed(() =>
    [...this.filteredNodes()]
      .filter(n => n.blocks.length > 0)
      .sort((a, b) => b.impactScore - a.impactScore)
  );

  // BFS from selected node → marks each reachable node as 'direct' or 'indirect'
  affectedNodes = computed((): Map<number, 'direct' | 'indirect'> => {
    const selectedId = this.selectedNodeId();
    if (selectedId == null) return new Map();
    const byId = this.nodeById();
    const result = new Map<number, 'direct' | 'indirect'>();
    const queue: Array<{ id: number; hop: number }> = [{ id: selectedId, hop: 0 }];
    const visited = new Set<number>([selectedId]);
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

  hasDevops = computed(() => !!this.tokens.devopsToken());

  async ngOnInit() {
    if (this.hasDevops()) await this.fetchProjects();
  }

  async fetchProjects() {
    this.loadingProjects.set(true);
    try {
      const res = await firstValueFrom(this.devops.listProjects());
      this.projects.set(res.value ?? []);
      if (res.value?.length) this.selectedProject.set(res.value[0].name);
    } catch { /* ignore */ } finally {
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
      const wiql = `SELECT [System.Id] FROM WorkItemLinks WHERE ([Source].[System.TeamProject] = '${project}') AND ([System.Links.LinkType] = 'System.LinkTypes.Dependency-Forward') MODE (MayContain)`;
      const linkRes = await firstValueFrom(this.devops.queryWorkItemLinks(project, wiql));
      const relations = (linkRes.workItemRelations ?? []).filter(r => r.rel != null && r.source && r.target);

      if (!relations.length) {
        this.loading.set(false);
        return;
      }

      const allIds = new Set<number>();
      for (const r of relations) { allIds.add(r.source!.id); allIds.add(r.target!.id); }

      const idArr = [...allIds];
      const fetchedItems: DevOpsWorkItem[] = [];
      for (let i = 0; i < idArr.length; i += 200) {
        const res = await firstValueFrom(this.devops.listWorkItems(project, idArr.slice(i, i + 200)));
        fetchedItems.push(...(res.value ?? []));
      }
      const itemById = new Map(fetchedItems.map(i => [i.id, i]));

      const blocks = new Map<number, Set<number>>();
      const blockedBy = new Map<number, Set<number>>();
      for (const id of allIds) { blocks.set(id, new Set()); blockedBy.set(id, new Set()); }

      const edgeSeen = new Set<string>();
      const rawEdges: BEdge[] = [];
      for (const r of relations) {
        const src = r.source!.id, tgt = r.target!.id;
        const key = `${src}-${tgt}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        blocks.get(src)!.add(tgt);
        blockedBy.get(tgt)!.add(src);
        rawEdges.push({ id: key, fromId: src, toId: tgt });
      }

      // Level assignment via DFS memoization (handles cycles)
      const levels = new Map<number, number>();
      const getLevel = (id: number, visiting: Set<number>): number => {
        if (levels.has(id)) return levels.get(id)!;
        if (visiting.has(id)) return 0;
        visiting.add(id);
        const preds = [...(blockedBy.get(id) ?? [])];
        const level = preds.length ? Math.max(...preds.map(p => getLevel(p, visiting) + 1)) : 0;
        visiting.delete(id);
        levels.set(id, level);
        return level;
      };
      for (const id of allIds) getLevel(id, new Set());

      // Group by level for vertical stacking
      const levelGroups = new Map<number, number[]>();
      for (const [id, lvl] of levels) {
        if (!levelGroups.has(lvl)) levelGroups.set(lvl, []);
        levelGroups.get(lvl)!.push(id);
      }

      // Sort each level's nodes: blockers first (higher impactScore), then alphabetically
      const computeImpact = (startId: number): number => {
        const visited = new Set<number>();
        const stack = [...(blocks.get(startId) ?? [])];
        while (stack.length) {
          const id = stack.pop()!;
          if (visited.has(id)) continue;
          visited.add(id);
          for (const next of blocks.get(id) ?? []) stack.push(next);
        }
        return visited.size;
      };
      const impacts = new Map<number, number>();
      for (const id of allIds) impacts.set(id, computeImpact(id));

      for (const ids of levelGroups.values()) {
        ids.sort((a, b) => (impacts.get(b) ?? 0) - (impacts.get(a) ?? 0));
      }

      // Assign pixel positions
      const positions = new Map<number, { x: number; y: number }>();
      for (const [lvl, ids] of levelGroups) {
        ids.forEach((id, i) => {
          positions.set(id, {
            x: CANVAS_PAD + lvl * (NODE_W + H_GAP),
            y: CANVAS_PAD + i * (NODE_H + V_GAP),
          });
        });
      }

      const xs = [...positions.values()].map(p => p.x);
      const ys = [...positions.values()].map(p => p.y);
      this.canvasWidth.set(Math.max(...xs) + NODE_W + CANVAS_PAD);
      this.canvasHeight.set(Math.max(...ys) + NODE_H + CANVAS_PAD);

      const bNodes: BNode[] = [...allIds]
        .filter(id => itemById.has(id))
        .map(id => ({
          id,
          item: itemById.get(id)!,
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
    const x1 = from.x + NODE_W, y1 = from.y + NODE_H / 2;
    const x2 = to.x,           y2 = to.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1} ${cx} ${y2} ${x2} ${y2}`;
  }

  toggleTypeFilter(type: string): void {
    this.filterTypes.update(s => { const n = new Set(s); n.has(type) ? n.delete(type) : n.add(type); return n; });
  }

  toggleStateFilter(state: string): void {
    this.filterStates.update(s => { const n = new Set(s); n.has(state) ? n.delete(state) : n.add(state); return n; });
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

  selectNode(id: number) {
    this.selectedNodeId.set(this.selectedNodeId() === id ? null : id);
  }

  itemTitle(id: number): string {
    return this.nodeById().get(id)?.item.fields['System.Title'] ?? `#${id}`;
  }

  typeColor(type: string): string {
    switch ((type ?? '').toLowerCase()) {
      case 'epic':        return '#a371f7';
      case 'feature':     return '#58a6ff';
      case 'user story':  return '#3fb950';
      case 'task':        return '#f0883e';
      case 'bug':         return '#f85149';
      default:            return '#8b949e';
    }
  }

  devopsUrl(item: DevOpsWorkItem): string {
    return item._links?.html?.href ?? item.url;
  }
}
