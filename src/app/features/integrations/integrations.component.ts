import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, DecimalPipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import {
  GenericSource,
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

const DEFAULT_MAPPINGS: MappingRow[] = [];

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, TranslateModule],
  templateUrl: './integrations.component.html',
  styleUrl: './integrations.component.scss',
})
export class IntegrationsComponent implements OnInit, OnDestroy {
  private readonly svc = inject(GenericSourceService);
  private readonly toasts = inject(ToastService);

  readonly sources = this.svc.sources;
  readonly results = this.svc.results;

  activeTab = signal<'sources' | 'editor'>('sources');

  // ── Editor form state ──────────────────────────────────────────────────────
  selectedId = signal<string | null>(null);
  formName = signal('');
  formUrl = signal('');
  formAuthType = signal<'none' | 'bearer' | 'basic'>('none');
  formToken = signal('');
  formUser = signal('');
  formPass = signal('');
  formInterval = signal(30);
  formPollEnabled = signal(true);
  formOrchMode = signal<'once' | 'poll'>('poll');
  formOrchInterval = signal(6);
  formOrchMaxPolls = signal(20);
  formStatusPath = signal('');
  formMappings = signal<MappingRow[]>(DEFAULT_MAPPINGS.map((m) => ({ ...m })));
  formNamePath = signal('');
  formUrlPath = signal('');
  formMethod = signal<'GET' | 'POST'>('GET');
  formBody = signal('');

  // ── Test state ─────────────────────────────────────────────────────────────
  testLoading = signal(false);
  testResult = signal<{ ok: boolean; rawStatus?: string; status?: string; error?: string } | null>(
    null,
  );

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
    this.formPollEnabled.set(source.pollIntervalSec > 0);
    this.formInterval.set(source.pollIntervalSec > 0 ? source.pollIntervalSec : 30);
    this.formOrchMode.set(source.orchMode ?? 'poll');
    this.formOrchInterval.set(source.orchPollIntervalSec ?? 6);
    this.formOrchMaxPolls.set(source.orchMaxPolls ?? 20);
    this.formStatusPath.set(source.statusPath);
    this.formMappings.set(source.mappings.map((m) => ({ ...m })));
    this.formNamePath.set(source.namePath ?? '');
    this.formUrlPath.set(source.urlPath ?? '');
    this.testResult.set(null);
    this.activeTab.set('editor');
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
    this.formInterval.set(30);
    this.formPollEnabled.set(true);
    this.formOrchMode.set('poll');
    this.formOrchInterval.set(6);
    this.formOrchMaxPolls.set(20);
    this.formStatusPath.set('');
    this.formMappings.set(DEFAULT_MAPPINGS.map((m) => ({ ...m })));
    this.formNamePath.set('');
    this.formUrlPath.set('');
    this.testResult.set(null);
    this.activeTab.set('editor');
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
      pollIntervalSec: this.formPollEnabled() ? Math.max(5, this.formInterval()) : 0,
      enabled: true,
      statusPath: this.formStatusPath().trim(),
      mappings: this.formMappings().filter(
        (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
      ),
      namePath: this.formNamePath().trim() || undefined,
      urlPath: this.formUrlPath().trim() || undefined,
      orchMode: this.formOrchMode(),
      orchPollIntervalSec: this.formOrchMode() === 'poll' ? this.formOrchInterval() : undefined,
      orchMaxPolls: this.formOrchMode() === 'poll' ? this.formOrchMaxPolls() : undefined,
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
      statusPath: this.formStatusPath().trim(),
      mappings: this.formMappings().filter(
        (m): m is GenericSourceMapping => !!m.raw.trim() && !!m.mapped,
      ),
      namePath: this.formNamePath().trim() || undefined,
      urlPath: this.formUrlPath().trim() || undefined,
      orchMode: 'once',
      createdAt: '',
    };
    this.testLoading.set(true);
    this.testResult.set(null);
    this.svc.testFetch(tempSource).subscribe({
      next: (result) => {
        this.testResult.set({ ok: true, rawStatus: result.rawStatus, status: result.status });
        this.testLoading.set(false);
      },
      error: (err: unknown) => {
        const e = err as { message?: string; status?: number };
        this.testResult.set({
          ok: false,
          error: e?.message ?? (e?.status ? `HTTP ${e.status}` : 'Connection failed'),
        });
        this.testLoading.set(false);
      },
    });
  }

  // ── Mapping rows ───────────────────────────────────────────────────────────
  addMapping(): void {
    this.formMappings.update((m) => [...m, { raw: '', mapped: 'unknown' }]);
  }

  removeMapping(index: number): void {
    this.formMappings.update((m) => m.filter((_, i) => i !== index));
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
          running: '◌',
          unknown: '○',
          error: '!',
        } as Record<string, string>
      )[status] ?? '○'
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
