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
  exportPdf(): void {
    const entries = this.filtered();
    const now = new Date().toLocaleString();
    const rows = entries
      .map(
        (e) => `
        <tr>
          <td>${e.timestamp}</td>
          <td><span class="badge badge-${this.entryCategory(e.action)}">${this.translate.instant(this.filterLabel(e.action))}</span></td>
          <td>${e.action}</td>
          <td>${e.detail ?? ''}</td>
        </tr>`,
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>CDM Audit Log</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #222; padding: 24px; }
    header { margin-bottom: 16px; border-bottom: 2px solid #333; padding-bottom: 10px; }
    header h1 { font-size: 18px; font-weight: 700; }
    header p  { font-size: 11px; color: #555; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #f4f4f4; font-weight: 600; text-align: left;
         padding: 6px 8px; border-top: 1px solid #ccc; border-bottom: 2px solid #999; }
    td { padding: 5px 8px; border-bottom: 1px solid #e8e8e8; vertical-align: top; word-break: break-word; }
    tr:last-child td { border-bottom: none; }
    .badge { font-size: 9px; padding: 2px 6px; border-radius: 3px;
             background: #e0e0e0; color: #333; white-space: nowrap; }
    .badge-token   { background: #dbeafe; color: #1e40af; }
    .badge-chain   { background: #dcfce7; color: #166534; }
    .badge-graph   { background: #fef9c3; color: #854d0e; }
    .badge-session { background: #fce7f3; color: #9d174d; }
    @media print {
      body { padding: 0; }
      @page { margin: 1.5cm; size: A4; }
    }
  </style>
  <script>window.addEventListener('load', () => window.print());</script>
</head>
<body>
  <header>
    <h1>CDM — Audit Log</h1>
    <p>Exported ${now} &nbsp;·&nbsp; ${entries.length} entries</p>
  </header>
  <table>
    <thead>
      <tr>
        <th style="width:14em">Timestamp</th>
        <th style="width:8em">Category</th>
        <th style="width:22em">Action</th>
        <th>Detail</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'width=900,height=700');
    if (!win) URL.revokeObjectURL(url);
  }
}
