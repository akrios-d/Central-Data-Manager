import { Injectable, signal } from '@angular/core';

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
  private _toasts = signal<Toast[]>([]);
  readonly toasts = this._toasts.asReadonly();
  private nextId = 0;

  show(message: string, type: ToastType = 'info', duration = 4000): void {
    const id = ++this.nextId;
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
