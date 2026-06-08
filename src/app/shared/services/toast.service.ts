import { Injectable, inject, signal } from '@angular/core';
import { AppSettingsService } from '../../core/services/app-settings.service';

export type ToastType = 'info' | 'success' | 'danger' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  message: string;
  confirm?: {
    label: string;
    action: () => void;
  };
  cancelLabel?: string;
  duration?: number;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly settings = inject(AppSettingsService);
  private readonly _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private nextId = 0;

  /**
   * Show a toast notification.
   * @param durationOverride - ms to auto-dismiss. Omit to use the user's setting.
   *                           Pass 0 to never auto-dismiss regardless of setting.
   */
  show(message: string, type: ToastType = 'info', durationOverride?: number): void {
    const id = ++this.nextId;
    const settingMs = this.settings.toastDurationSec() * 1000;
    const duration = durationOverride !== undefined ? durationOverride : settingMs;
    this._toasts.update((t) => [...t, { id, type, message, duration }]);
    if (duration > 0) setTimeout(() => this.dismiss(id), duration);
  }

  confirm(message: string, confirmLabel: string, action: () => void, cancelLabel = 'Cancel'): void {
    const id = ++this.nextId;
    this._toasts.update((t) => [
      ...t,
      { id, type: 'danger', message, confirm: { label: confirmLabel, action }, cancelLabel },
    ]);
  }

  dismiss(id: number): void {
    this._toasts.update((t) => t.filter((toast) => toast.id !== id));
  }
}
