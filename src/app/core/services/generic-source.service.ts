import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import {
  GenericSource,
  GenericSourceMapping,
  GenericSourceResult,
  SourceStatus,
} from '../models/generic-source.model';

const SOURCES_KEY = 'cdm:generic_sources';
const RESULTS_KEY = 'cdm:generic_results';

@Injectable({ providedIn: 'root' })
export class GenericSourceService {
  private readonly http = inject(HttpClient);

  private readonly _sources = signal<GenericSource[]>(this.loadSources());
  private readonly _results = signal<Record<string, GenericSourceResult>>(this.loadResults());

  readonly sources = this._sources.asReadonly();
  readonly results = this._results.asReadonly();

  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();

  // ── CRUD ──────────────────────────────────────────────────────────────────

  saveSource(source: GenericSource): void {
    this._sources.update((list) => {
      const idx = list.findIndex((s) => s.id === source.id);
      const next = idx >= 0 ? list.map((s, i) => (i === idx ? source : s)) : [...list, source];
      localStorage.setItem(SOURCES_KEY, JSON.stringify(next));
      return next;
    });
  }

  deleteSource(id: string): void {
    this.clearTimer(id);
    this._sources.update((list) => {
      const next = list.filter((s) => s.id !== id);
      localStorage.setItem(SOURCES_KEY, JSON.stringify(next));
      return next;
    });
    this._results.update((r) => {
      const next = { ...r };
      delete next[id];
      localStorage.setItem(RESULTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  startPolling(): void {
    const enabled = this._sources().filter((s) => s.enabled);
    const enabledIds = new Set(enabled.map((s) => s.id));

    // Stop timers no longer needed
    for (const id of this.timers.keys()) {
      if (!enabledIds.has(id)) this.clearTimer(id);
    }

    // Start timers for newly enabled sources (skip if pollIntervalSec === 0)
    for (const source of enabled) {
      if (!this.timers.has(source.id)) {
        if (source.pollIntervalSec > 0) {
          this.poll(source);
          const timer = setInterval(() => this.poll(source), source.pollIntervalSec * 1000);
          this.timers.set(source.id, timer);
        }
      }
    }
  }

  stopPolling(): void {
    for (const id of this.timers.keys()) this.clearTimer(id);
  }

  poll(source: GenericSource): void {
    const headers = this.buildHeaders(source);
    this.buildRequest(source, headers).subscribe({
      next: (data) => this.applyResult(source, data),
      error: (err) => this.applyError(source, err),
    });
  }

  testFetch(source: GenericSource): Observable<{
    status: SourceStatus;
    rawStatus: string;
    displayName?: string;
    runUrl?: string;
  }> {
    const headers = this.buildHeaders(source);
    return this.buildRequest(source, headers).pipe(
      map((data) => {
        const rawStr = this.resolveStr(data, source.statusPath) ?? '';
        const mapped = source.mappings.find((m) => m.raw === rawStr)?.mapped;
        const status: SourceStatus = mapped ?? 'unknown';
        return {
          status,
          rawStatus: rawStr,
          displayName: source.namePath ? this.resolveStr(data, source.namePath) : undefined,
          runUrl: source.urlPath ? this.resolveStr(data, source.urlPath) : undefined,
        };
      }),
    );
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private applyResult(source: GenericSource, data: unknown): void {
    const rawStr = this.resolveStr(data, source.statusPath) ?? '';
    const mapped = source.mappings.find((m: GenericSourceMapping) => m.raw === rawStr)?.mapped;
    const status: SourceStatus = mapped ?? 'unknown';
    const result: GenericSourceResult = {
      sourceId: source.id,
      fetchedAt: new Date().toISOString(),
      status,
      rawStatus: rawStr,
      displayName: source.namePath ? this.resolveStr(data, source.namePath) : undefined,
      runUrl: source.urlPath ? this.resolveStr(data, source.urlPath) : undefined,
    };
    this._results.update((r) => {
      const next = { ...r, [source.id]: result };
      localStorage.setItem(RESULTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  private applyError(source: GenericSource, err: unknown): void {
    const e = err as { message?: string; status?: number; statusText?: string };
    const error = e?.message ?? (e?.status ? `HTTP ${e.status}` : 'Network error');
    const result: GenericSourceResult = {
      sourceId: source.id,
      fetchedAt: new Date().toISOString(),
      status: 'error',
      error,
    };
    this._results.update((r) => {
      const next = { ...r, [source.id]: result };
      localStorage.setItem(RESULTS_KEY, JSON.stringify(next));
      return next;
    });
  }

  private buildRequest(
    source: GenericSource,
    headers: Record<string, string>,
  ): Observable<unknown> {
    if (source.method === 'POST') {
      const body = source.body?.trim() ? JSON.parse(source.body) : null;
      return this.http.post<unknown>(source.url, body, {
        headers: { 'Content-Type': 'application/json', ...headers },
      });
    }
    return this.http.get<unknown>(source.url, { headers });
  }

  private buildHeaders(source: GenericSource): Record<string, string> {
    const headers: Record<string, string> = {};
    if (source.authType === 'bearer' && source.authToken) {
      headers['Authorization'] = `Bearer ${source.authToken}`;
    } else if (source.authType === 'basic' && source.authUser) {
      const creds = btoa(`${source.authUser}:${source.authPass ?? ''}`);
      headers['Authorization'] = `Basic ${creds}`;
    }
    return headers;
  }

  private resolvePath(obj: unknown, path: string): unknown {
    if (!path.trim()) return undefined;
    return path
      .split('.')
      .reduce(
        (cur, key) =>
          cur != null && typeof cur === 'object'
            ? (cur as Record<string, unknown>)[key]
            : undefined,
        obj,
      );
  }

  private resolveStr(obj: unknown, path: string): string | undefined {
    const val = this.resolvePath(obj, path);
    if (typeof val === 'string') return val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    return undefined;
  }

  private clearTimer(id: string): void {
    const timer = this.timers.get(id);
    if (timer !== undefined) {
      clearInterval(timer);
      this.timers.delete(id);
    }
  }

  private loadSources(): GenericSource[] {
    try {
      return JSON.parse(localStorage.getItem(SOURCES_KEY) ?? '[]');
    } catch {
      return [];
    }
  }

  private loadResults(): Record<string, GenericSourceResult> {
    try {
      return JSON.parse(localStorage.getItem(RESULTS_KEY) ?? '{}');
    } catch {
      return {};
    }
  }
}
