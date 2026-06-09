import {
  Component,
  input,
  output,
  computed,
  HostListener,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { BoardWorkItem } from '../../../core/interfaces/boards-provider.interface';
import { MarkdownPipe } from '../../pipes/markdown.pipe';

@Component({
  selector: 'app-work-item-panel',
  imports: [DatePipe, MarkdownPipe, TranslateModule],
  templateUrl: './work-item-panel.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './work-item-panel.component.scss',
})
export class WorkItemPanelComponent {
  item = input<BoardWorkItem | null>(null);
  closed = output<void>();

  readonly tags = computed(() => this.item()?.tags ?? []);
  readonly priorityLabel = computed(() => this.item()?.priorityLabel ?? null);

  stateClass(state: string): string {
    const map: Record<string, string> = {
      New: 'state-new',
      Active: 'state-active',
      Resolved: 'state-resolved',
      Closed: 'state-closed',
      Removed: 'state-removed',
      'To Do': 'state-new',
      'In Progress': 'state-active',
      Done: 'state-closed',
      Backlog: 'state-new',
    };
    return map[state] ?? '';
  }

  @HostListener('document:keydown.escape')
  close(): void {
    if (this.item()) this.closed.emit();
  }
}
