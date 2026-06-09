import {
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  GenericSource,
  GenericSourceCheck,
  GenericSourceMapping,
  GenericSourceResult,
  SourceStatus,
} from '../../core/models/generic-source.model';
import { GenericSourceService } from '../../core/services/generic-source.service';
import { ToastService } from '../../shared/services/toast.service';

interface MappingRow {
  raw: string;
  mapped: SourceStatus | '';
}

interface CheckFormItem {
  fieldPath: string;
  mappings: MappingRow[];
  expanded: boolean;
}

function defaultCheck(): CheckFormItem {
  return { fieldPath: '', mappings: [], expanded: true };
}

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [FormsModule, DatePipe, TranslateModule],
  templateUrl: './integrations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './integrations.component.scss',
})
export class IntegrationsComponent implements OnInit, OnDestroy {
  private readonly svc = inject(GenericSourceService);
  private readonly toasts = inject(ToastService);

  readonly sources = this.svc.sources;
  readonly results = this.svc.results;

  activeTab = signal<'sources' | 'editor'>('sources');
  editorTab = signal<'connection' | 'config'>('connection');

  // ── Editor form state ──────────────────────────────────────────────────────
  selectedId = signal<string | null>(null);
  formName = signal('');
  formUrl = signal('');
  formAuthType = signal<'none' | 'bearer' | 'basic'>('none');
  formToken = signal('');
  formUser = signal('');
  formPass = signal('');
  formOrchMode = signal<'once' | 'poll'>('poll');
  formOrchInterval = signal(30);
  formOrchMaxPolls = signal(20);
  orchPollMinutes = computed(() =>
    Math.round((this.formOrchInterval() * this.formOrchMaxPolls()) / 60),
  );
  formChecks = signal<CheckFormItem[]>([defaultCheck()]);
  editingCheckIdx = signal<number | null>(null);
  checkTestResult = signal<{ raw: string; mapped: string } | { error: string } | null>(null);
  formNamePath = signal('');
  formUrlPath = signal('');
  formMethod = signal<'GET' | 'POST'>('GET');
  formBody = signal('');
  formCustomHeaders = signal<{ key: string; value: string }[]>([]);

  // ── Test state ─────────────────────────────────────────────────────────────
  testLoading = signal(false);
  testResult = signal<{
    ok: boolean;
    status?: string;
    rawStatus?: string;
    checkResults?: { fieldPath: string; raw: string; mapped: string }[];
    responsePreview?: string;
    error?: string;
  } | null>(null);
  readonly previewPaths = signal<string[]>([]);

  // ── Options ────────────────────────────────────────────────────────────────
  readonly authOptions: { value: 'none' | 'bearer' | 'basic'; label: string }[] = [
    { value: 'none', label: 'integrations.authNone' },
    { value: 'bearer', label: 'integrations.authBearer' },
    { value: 'basic', label: 'integrations.authBasic' },
  ];
  readonly statusOptions: { value: SourceStatus; label: string }[] = [
    { value: 'success', label: 'success' },
    { value: 'failure', label: 'failure' },
    { value: 'running', label: 'running' },
    { value: 'unknown', label: 'unknown' },
  ];

  readonly selectedSource = computed(() => {
    const id = this.selectedId();
    return id && id !== 'new' ? (this.sources().find((s) => s.id === id) ?? null) : null;
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.svc.startPolling();
  }

  ngOnDestroy(): void {
    this.svc.stopPolling();
  }

  // ── Source list ────────────────────────────────────────────────────────────
  selectSource(source: GenericSource): void {
    this.selectedId.set(source.id);
    this.formName.set(source.name);
    this.formUrl.set(source.url);
    this.formMethod.set(source.method ?? 'GET');
    this.formBody.set(source.body ?? '');
    this.formAuthType.set(source.authType);
    this.formToken.set(source.authToken ?? '');
    this.formUser.set(source.authUser ?? '');
    this.formPass.set(source.authPass ?? '');
    this.formOrchMode.set(source.orchMode ?? 'poll');
    this.formOrchInterval.set(source.orchPollIntervalSec ?? 30);
    this.formOrchMaxPolls.set(source.orchMaxPolls ?? 20);
    const checks: CheckFormItem[] =
      source.checks && source.checks.length > 0
        ? source.checks.map((c) => ({
            fieldPath: c.fieldPath,
            mappings: c.mappings.map((m) => ({ ...m })),
            expanded: true,
          }))
        : [
            {
              fieldPath: source.statusPath,
              mappings: source.mappings.map((m) => ({ ...m })),
              expanded: true,
            },
          ];
    this.formChecks.set(checks);
    this.formCustomHeaders.set(
      (source.customHeaders ?? []).map((h) => ({ key: h.key, value: h.value })),
    );
    this.formNamePath.set(source.namePath ?? '');
    this.formUrlPath.set(source.urlPath ?? '');
    this.testResult.set(null);
    this.editingCheckIdx.set(null);
    this.activeTab.set('editor');
    this.editorTab.set('connection');
  }

  newSource(): void {
    this.selectedId.set('new');
    this.formName.set('');
    this.formUrl.set('');
    this.formMethod.set('GET');
    this.formBody.set('');
    this.formAuthType.set('none');
    this.formToken.set('');
    this.formUser.set('');
    this.formPass.set('');
    this.formOrchMode.set('poll');
    this.formOrchInterval.set(30);
    this.formOrchMaxPolls.set(20);
    this.formChecks.set([defaultCheck()]);
    this.formCustomHeaders.set([]);
    this.formNamePath.set('');
    this.formUrlPath.set('');
    this.testResult.set(null);
    this.editingCheckIdx.set(null);
    this.activeTab.set('editor');
    this.editorTab.set('connection');
  }

  // ── Editor actions ─────────────────────────────────────────────────────────
  saveSource(): void {
    const name = this.formName().trim();
    const url = this.formUrl().trim();
    if (!name) {
      this.toasts.show('Name is required', 'danger');
      return;
    }
    if (!url) {
      this.toasts.show('URL is required', 'danger');
      return;
    }
    const currentId = this.selectedId();
    const id = currentId === 'new' || !currentId ? crypto.randomUUID() : currentId;
    const method = this.formMethod();
    const source: GenericSource = {
      id,
      name,
      url,
      method,
      body: method === 'POST' ? this.formBody().trim() || undefined : undefined,
      authType: this.formAuthType(),
      authToken: this.formToken().trim() || undefined,
      authUser: this.formUser().trim() || undefined,
      authPass: this.formPass() || undefined,
      pollIntervalSec: 0,
      enabled: true,
      statusPath: this.formChecks()[0]?.fieldPath.trim() ?? '',
      mappings:
        this.formChecks()[0]?.mappings.filter(
          (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
        ) ?? [],
      checks: this.formChecks()
        .filter((c) => c.fieldPath.trim())
        .map(
          (c): GenericSourceCheck => ({
            fieldPath: c.fieldPath.trim(),
            mappings: c.mappings.filter(
              (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
            ),
          }),
        ),
      customHeaders:
        this.formCustomHeaders()
          .filter((h) => h.key.trim())
          .map((h) => ({ key: h.key.trim(), value: h.value })).length > 0
          ? this.formCustomHeaders()
              .filter((h) => h.key.trim())
              .map((h) => ({ key: h.key.trim(), value: h.value }))
          : undefined,
      namePath: this.formNamePath().trim() || undefined,
      urlPath: this.formUrlPath().trim() || undefined,
      orchMode: this.formOrchMode(),
      orchPollIntervalSec:
        this.formOrchMode() === 'poll' ? Math.max(5, this.formOrchInterval()) : undefined,
      orchMaxPolls:
        this.formOrchMode() === 'poll' ? Math.max(1, this.formOrchMaxPolls()) : undefined,
      createdAt: this.selectedSource()?.createdAt ?? new Date().toISOString(),
    };
    this.svc.saveSource(source);
    this.selectedId.set(id);
    this.svc.startPolling();
    this.toasts.show(`"${name}" saved`, 'success');
  }

  deleteSource(): void {
    const id = this.selectedId();
    if (!id || id === 'new') return;
    const name = this.formName();
    this.toasts.confirm(`Delete "${name}"?`, 'Delete', () => {
      this.svc.deleteSource(id);
      this.selectedId.set(null);
      this.activeTab.set('sources');
      this.toasts.show('Deleted', 'success');
    });
  }

  testCheck(idx: number): void {
    const preview = this.testResult()?.responsePreview;
    if (!preview) {
      this.checkTestResult.set({ error: 'Run a connection test first' });
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(preview);
    } catch {
      this.checkTestResult.set({ error: 'Could not parse response JSON' });
      return;
    }
    const check = this.formChecks()[idx];
    if (!check?.fieldPath) {
      this.checkTestResult.set({ error: 'Enter a field path first' });
      return;
    }
    const raw = this.resolvePath(parsed, check.fieldPath);
    const rawStr = raw !== undefined && raw !== null ? String(raw) : '(not found)';
    const match = check.mappings.find((m) => m.raw === rawStr);
    this.checkTestResult.set({ raw: rawStr, mapped: match?.mapped ?? 'unknown' });
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

  private extractPaths(obj: unknown, prefix = ''): string[] {
    const paths: string[] = [];
    if (obj === null || typeof obj !== 'object') return paths;
    const entries = Array.isArray(obj)
      ? (obj as unknown[]).slice(0, 1).map((v, i) => [String(i), v] as [string, unknown])
      : (Object.entries(obj as Record<string, unknown>) as [string, unknown][]);
    for (const [key, val] of entries) {
      const p = prefix ? `${prefix}.${key}` : key;
      paths.push(p);
      if (val !== null && typeof val === 'object') {
        paths.push(...this.extractPaths(val, p));
      }
    }
    return paths;
  }

  copyPreview(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.toasts.show('Copied to clipboard', 'success');
    });
  }

  testSource(): void {
    const url = this.formUrl().trim();
    if (!url) {
      this.toasts.show('Enter a URL first', 'danger');
      return;
    }
    const testMethod = this.formMethod();
    const tempSource: GenericSource = {
      id: '__test__',
      name: 'test',
      url,
      method: testMethod,
      body: testMethod === 'POST' ? this.formBody().trim() || undefined : undefined,
      authType: this.formAuthType(),
      authToken: this.formToken().trim() || undefined,
      authUser: this.formUser().trim() || undefined,
      authPass: this.formPass() || undefined,
      pollIntervalSec: 30,
      enabled: true,
      statusPath: this.formChecks()[0]?.fieldPath.trim() ?? '',
      mappings:
        this.formChecks()[0]?.mappings.filter(
          (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
        ) ?? [],
      checks: this.formChecks()
        .filter((c) => c.fieldPath.trim())
        .map(
          (c): GenericSourceCheck => ({
            fieldPath: c.fieldPath.trim(),
            mappings: c.mappings.filter(
              (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
            ),
          }),
        ),
      customHeaders: this.formCustomHeaders()
        .filter((h) => h.key.trim())
        .map((h) => ({ key: h.key.trim(), value: h.value })),
      namePath: this.formNamePath().trim() || undefined,
      urlPath: this.formUrlPath().trim() || undefined,
      orchMode: 'once',
      createdAt: '',
    };
    this.testLoading.set(true);
    this.testResult.set(null);
    this.svc.testFetch(tempSource).subscribe({
      next: (result) => {
        try {
          const parsed: unknown = JSON.parse(result.responsePreview);
          this.previewPaths.set(this.extractPaths(parsed));
        } catch {
          this.previewPaths.set([]);
        }
        this.testResult.set({
          ok: true,
          status: result.status,
          rawStatus: result.rawStatus,
          checkResults: result.checkResults,
          responsePreview: result.responsePreview,
        });
        this.testLoading.set(false);
      },
      error: (err: unknown) => {
        const e = err as { message?: string; status?: number; statusText?: string };
        let error: string;
        if (e?.status === 0) {
          error = 'Network / CORS error — endpoint must allow cross-origin requests';
        } else if (e?.status) {
          error = `HTTP ${e.status}${e.statusText ? ' ' + e.statusText : ''}`;
        } else {
          error = e?.message ?? 'Connection failed';
        }
        this.testResult.set({ ok: false, error });
        this.testLoading.set(false);
      },
    });
  }

  // ── Source list actions ────────────────────────────────────────────────────
  exportSourceFromList(source: GenericSource, event: MouseEvent): void {
    event.stopPropagation();
    const blob = new Blob([JSON.stringify(source, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `integration-${source.name.replaceAll(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  duplicateSource(source: GenericSource, event: MouseEvent): void {
    event.stopPropagation();
    const copy: GenericSource = {
      ...source,
      id: crypto.randomUUID(),
      name: `${source.name} (copy)`,
      createdAt: new Date().toISOString(),
    };
    this.svc.saveSource(copy);
    this.selectSource(copy);
    this.svc.startPolling();
    this.toasts.show(`"${copy.name}" created`, 'success');
  }

  deleteSourceFromList(source: GenericSource, event: MouseEvent): void {
    event.stopPropagation();
    this.toasts.confirm(`Delete "${source.name}"?`, 'Delete', () => {
      this.svc.deleteSource(source.id);
      if (this.selectedId() === source.id) {
        this.selectedId.set(null);
        this.activeTab.set('sources');
      }
      this.toasts.show('Deleted', 'success');
    });
  }

  // ── Check management ──────────────────────────────────────────────────────
  addCheck(): void {
    const newIdx = this.formChecks().length;
    this.formChecks.update((cs) => [...cs, defaultCheck()]);
    this.editingCheckIdx.set(newIdx);
  }

  openCheckPanel(idx: number): void {
    this.checkTestResult.set(null);
    this.editingCheckIdx.set(idx);
  }

  closeCheckPanel(): void {
    this.checkTestResult.set(null);
    this.editingCheckIdx.set(null);
  }

  removeCheck(checkIdx: number): void {
    this.formChecks.update((cs) => cs.filter((_, i) => i !== checkIdx));
  }

  toggleCheckExpanded(checkIdx: number): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) => (i === checkIdx ? { ...c, expanded: !c.expanded } : c)),
    );
  }

  setCheckFieldPath(checkIdx: number, val: string): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) => (i === checkIdx ? { ...c, fieldPath: val } : c)),
    );
  }

  addCheckMapping(checkIdx: number): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) =>
        i === checkIdx
          ? { ...c, mappings: [...c.mappings, { raw: '', mapped: 'unknown' as SourceStatus }] }
          : c,
      ),
    );
  }

  removeCheckMapping(checkIdx: number, mapIdx: number): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) =>
        i === checkIdx ? { ...c, mappings: c.mappings.filter((_, mi) => mi !== mapIdx) } : c,
      ),
    );
  }

  setCheckMappingRaw(checkIdx: number, mapIdx: number, val: string): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) =>
        i === checkIdx
          ? {
              ...c,
              mappings: c.mappings.map((m, mi) => (mi === mapIdx ? { ...m, raw: val } : m)),
            }
          : c,
      ),
    );
  }

  setCheckMappingMapped(checkIdx: number, mapIdx: number, val: SourceStatus): void {
    this.formChecks.update((cs) =>
      cs.map((c, i) =>
        i === checkIdx
          ? {
              ...c,
              mappings: c.mappings.map((m, mi) => (mi === mapIdx ? { ...m, mapped: val } : m)),
            }
          : c,
      ),
    );
  }

  // ── Custom header management ──────────────────────────────────────────────
  addCustomHeader(): void {
    this.formCustomHeaders.update((hs) => [...hs, { key: '', value: '' }]);
  }

  removeCustomHeader(idx: number): void {
    this.formCustomHeaders.update((hs) => hs.filter((_, i) => i !== idx));
  }

  setCustomHeaderKey(idx: number, val: string): void {
    this.formCustomHeaders.update((hs) => hs.map((h, i) => (i === idx ? { ...h, key: val } : h)));
  }

  setCustomHeaderValue(idx: number, val: string): void {
    this.formCustomHeaders.update((hs) => hs.map((h, i) => (i === idx ? { ...h, value: val } : h)));
  }

  // ── Template helpers ───────────────────────────────────────────────────────
  getResult(sourceId: string): GenericSourceResult | null {
    return this.results()[sourceId] ?? null;
  }

  statusIcon(status: string): string {
    return (
      (
        {
          success: '✓',
          failure: '✕',
          running: '↻',
          unknown: '?',
          error: '!',
        } as Record<string, string>
      )[status] ?? '?'
    );
  }

  statusColor(status: string): string {
    return (
      (
        {
          success: 'success',
          failure: 'danger',
          running: 'info',
          error: 'danger',
        } as Record<string, string>
      )[status] ?? 'muted'
    );
  }
}
