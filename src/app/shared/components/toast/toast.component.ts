import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ToastService, Toast } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './toast.component.scss',
})
export class ToastComponent {
  readonly toast = inject(ToastService);

  confirm(t: Toast): void {
    t.confirm!.action();
    this.toast.dismiss(t.id);
  }
}
