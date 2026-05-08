import { Component, input, output, computed, HostListener } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DevOpsWorkItem } from '../../../core/services/devops-api.service';

@Component({
  selector: 'app-work-item-panel',
  imports: [DatePipe],
  templateUrl: './work-item-panel.component.html',
  styleUrl: './work-item-panel.component.scss',
})
export class WorkItemPanelComponent {
  item = input<DevOpsWorkItem | null>(null);
  closed = output<void>();

  readonly devopsUrl = computed(() => {
    const wi = this.item();
    if (!wi) return null;
    return wi._links?.html?.href ?? null;
  });

  readonly tags = computed(() => {
    const raw = this.item()?.fields['System.Tags'];
    if (!raw) return [];
    return raw.split(';').map((t) => t.trim()).filter(Boolean);
  });

  readonly priorityLabel = computed(() => {
    const p = this.item()?.fields['Microsoft.VSTS.Common.Priority'];
    if (p == null) return null;
    return p <= 1 ? '1 – Critical' : p === 2 ? '2 – High' : p === 3 ? '3 – Medium' : '4 – Low';
  });

  stateClass(state: string): string {
    const map: Record<string, string> = {
      New: 'state-new',
      Active: 'state-active',
      Resolved: 'state-resolved',
      Closed: 'state-closed',
      Removed: 'state-removed',
    };
    return map[state] ?? '';
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.item()) this.closed.emit();
  }
}
