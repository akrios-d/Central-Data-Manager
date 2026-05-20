import { Injectable, signal } from '@angular/core';
import { Chain, ChainRun } from '../models/chain.model';

const CHAINS_KEY = 'cdm:chains';
const RUNS_KEY = 'cdm:chain-runs';

@Injectable({ providedIn: 'root' })
export class ChainService {
  private _chains = signal<Chain[]>(this.loadChains());
  private _runs = signal<ChainRun[]>(this.loadRuns());

  readonly chains = this._chains.asReadonly();
  readonly runs = this._runs.asReadonly();

  saveChain(chain: Chain): void {
    const list = this._chains().filter((c) => c.id !== chain.id);
    const updated = [...list, chain];
    localStorage.setItem(CHAINS_KEY, JSON.stringify(updated));
    this._chains.set(updated);
  }

  deleteChain(id: string): void {
    const updated = this._chains().filter((c) => c.id !== id);
    localStorage.setItem(CHAINS_KEY, JSON.stringify(updated));
    this._chains.set(updated);
  }

  saveRun(run: ChainRun): void {
    const list = this._runs().filter((r) => r.id !== run.id);
    const updated = [run, ...list].slice(0, 50); // keep last 50
    localStorage.setItem(RUNS_KEY, JSON.stringify(updated));
    this._runs.set(updated);
  }

  getChain(id: string): Chain | undefined {
    return this._chains().find((c) => c.id === id);
  }

  private loadChains(): Chain[] {
    try {
      return JSON.parse(localStorage.getItem(CHAINS_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private loadRuns(): ChainRun[] {
    try {
      return JSON.parse(localStorage.getItem(RUNS_KEY) ?? '[]');
    } catch {
      return [];
    }
  }
}
