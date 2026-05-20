import { Injectable, signal } from '@angular/core';

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  detail?: string;
}

const LOG_KEY = 'cdm:audit_log';
const MAX_ENTRIES = 500;

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  readonly entries = signal<AuditEntry[]>(this.load());

  log(action: string, detail?: string): void {
    const entry: AuditEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      action,
      detail,
    };
    this.entries.update((list) => {
      const next = [entry, ...list].slice(0, MAX_ENTRIES);
      this.persist(next);
      return next;
    });
  }

  clear(): void {
    this.entries.set([]);
    localStorage.removeItem(LOG_KEY);
  }

  private load(): AuditEntry[] {
    try {
      return JSON.parse(localStorage.getItem(LOG_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private persist(entries: AuditEntry[]): void {
    try {
      localStorage.setItem(LOG_KEY, JSON.stringify(entries));
    } catch {
      /* storage full — skip */
    }
  }
}
