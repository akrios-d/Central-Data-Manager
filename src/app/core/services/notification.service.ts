import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private get supported(): boolean { return 'Notification' in window; }

  async requestPermission(): Promise<void> {
    if (this.supported && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }

  show(title: string, body: string): void {
    if (!this.supported || Notification.permission !== 'granted') return;
    try { new Notification(title, { body, icon: '/favicon.ico' }); } catch { /* unsupported context */ }
  }
}
