import { Injectable, signal } from '@angular/core';

const KEY = 'cdm:pinned_repos';

@Injectable({ providedIn: 'root' })
export class PinnedReposService {
  private readonly _pinned = signal<Set<string>>(this.load());

  readonly pinned = this._pinned.asReadonly();

  isPinned(fullName: string): boolean {
    return this._pinned().has(fullName);
  }

  toggle(fullName: string): void {
    this._pinned.update((set) => {
      const next = new Set(set);
      if (next.has(fullName)) next.delete(fullName);
      else next.add(fullName);
      localStorage.setItem(KEY, JSON.stringify([...next]));
      return next;
    });
  }

  private load(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]'));
    } catch {
      return new Set();
    }
  }
}
