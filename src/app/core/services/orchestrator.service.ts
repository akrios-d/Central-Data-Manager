import { Injectable, signal } from '@angular/core';
import { OrchGraph, OrchRun } from '../models/orchestrator.model';

const GRAPHS_KEY = 'cdm:orch_graphs';
const RUNS_KEY = 'cdm:orch_runs';

@Injectable({ providedIn: 'root' })
export class OrchestratorService {
  private readonly _graphs = signal<OrchGraph[]>(this.load<OrchGraph>(GRAPHS_KEY));
  private readonly _runs = signal<OrchRun[]>(this.load<OrchRun>(RUNS_KEY));

  readonly graphs = this._graphs.asReadonly();
  readonly runs = this._runs.asReadonly();

  saveGraph(g: OrchGraph): void {
    this._graphs.update((gs) => {
      const idx = gs.findIndex((x) => x.id === g.id);
      let next: OrchGraph[];
      if (idx >= 0) {
        next = gs.map((x, i) => (i === idx ? g : x));
      } else {
        next = [...gs, g];
      }
      localStorage.setItem(GRAPHS_KEY, JSON.stringify(next));
      return next;
    });
  }

  deleteGraph(id: string): void {
    this._graphs.update((gs) => {
      const next = gs.filter((g) => g.id !== id);
      localStorage.setItem(GRAPHS_KEY, JSON.stringify(next));
      return next;
    });
  }

  saveRun(run: OrchRun): void {
    this._runs.update((rs) => {
      const idx = rs.findIndex((r) => r.id === run.id);
      let next: OrchRun[];
      if (idx >= 0) {
        next = rs.map((r, i) => (i === idx ? run : r));
      } else {
        next = [run, ...rs];
      }
      const trimmed = next.slice(0, 50);
      localStorage.setItem(RUNS_KEY, JSON.stringify(trimmed));
      return trimmed;
    });
  }

  reorderGraphs(graphs: OrchGraph[]): void {
    localStorage.setItem(GRAPHS_KEY, JSON.stringify(graphs));
    this._graphs.set(graphs);
  }

  restoreAll(graphs: OrchGraph[]): void {
    localStorage.setItem(GRAPHS_KEY, JSON.stringify(graphs));
    this._graphs.set(graphs);
  }

  private load<T>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]');
    } catch {
      return [];
    }
  }
}
