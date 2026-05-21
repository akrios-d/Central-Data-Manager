import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AuditLogService } from '../../core/services/audit-log.service';
import { ToastService } from '../../shared/services/toast.service';

type FilterKey = 'all' | 'token' | 'chain' | 'graph' | 'session' | 'settings';

@Component({
  selector: 'app-audit-log',
  imports: [FormsModule, TranslateModule, DatePipe],
  templateUrl: './audit-log.component.html',
  styleUrl: './audit-log.component.scss',
})
export class AuditLogComponent {
  readonly audit = inject(AuditLogService);
  private readonly toasts = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly search = signal('');
  readonly activeFilter = signal<FilterKey>('all');

  readonly filters: { key: FilterKey; label: string }[] = [
    { key: 'all', label: 'audit.filterAll' },
    { key: 'token', label: 'audit.filterToken' },
    { key: 'chain', label: 'audit.filterChain' },
    { key: 'graph', label: 'audit.filterGraph' },
    { key: 'session', label: 'audit.filterSession' },
    { key: 'settings', label: 'audit.filterSettings' },
  ];

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const f = this.activeFilter();
    return this.audit.entries().filter((e) => {
      if (f !== 'all' && this.entryCategory(e.action) !== f) return false;
      if (q && !`${e.action} ${e.detail ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  entryCategory(action: string): FilterKey {
    const a = action.toLowerCase();
    if (a.includes('token') || a.includes('tokens')) return 'token';
    if (a.includes('chain')) return 'chain';
    if (a.includes('graph')) return 'graph';
    if (a.includes('session')) return 'session';
    return 'settings';
  }

  filterLabel(action: string): string {
    return (
      this.filters.find((f) => f.key === this.entryCategory(action))?.label ?? 'audit.filterAll'
    );
  }

  clearLog(): void {
    const msg = this.translate.instant('audit.clearConfirm');
    const btn = this.translate.instant('audit.clearConfirmBtn');
    this.toasts.confirm(msg, btn, () => this.audit.clear());
  }

  exportCsv(): void {
    const header = ['Timestamp', 'Category', 'Action', 'Detail'];
    const rows = this.filtered().map((e) => [
      e.timestamp,
      this.entryCategory(e.action),
      e.action,
      e.detail ?? '',
    ]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cdm-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
