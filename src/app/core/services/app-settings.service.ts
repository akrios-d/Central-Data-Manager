import { Injectable, signal } from '@angular/core';

const POLL_KEY = 'cdm:poll_interval_s';
const MAX_KEY = 'cdm:max_polls';
const TIMEOUT_KEY = 'cdm:session_timeout_h';
const NOTIF_KEY = 'cdm:notifications';
const TOAST_DURATION_KEY = 'cdm:toast_duration_s';
const WEBHOOK_URL_KEY = 'cdm:webhook_url';
const WEBHOOK_ENABLED_KEY = 'cdm:webhook_enabled';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  readonly pollIntervalSec = signal(Number(localStorage.getItem(POLL_KEY)) || 6);
  readonly maxPolls = signal(Number(localStorage.getItem(MAX_KEY)) || 120);
  readonly sessionTimeoutHours = signal(Number(localStorage.getItem(TIMEOUT_KEY)) || 8);
  readonly notificationsEnabled = signal(localStorage.getItem(NOTIF_KEY) !== 'false');
  /** Toast auto-dismiss delay in seconds. 0 = never auto-dismiss (manual close). */
  readonly toastDurationSec = signal(
    localStorage.getItem(TOAST_DURATION_KEY) !== null
      ? Number(localStorage.getItem(TOAST_DURATION_KEY))
      : 4,
  );
  readonly webhookUrl = signal(localStorage.getItem(WEBHOOK_URL_KEY) ?? '');
  readonly webhookEnabled = signal(localStorage.getItem(WEBHOOK_ENABLED_KEY) === 'true');

  save(intervalSec: number, maxPolls: number): void {
    const s = Math.max(2, Math.min(60, intervalSec));
    const m = Math.max(10, Math.min(500, maxPolls));
    localStorage.setItem(POLL_KEY, String(s));
    localStorage.setItem(MAX_KEY, String(m));
    this.pollIntervalSec.set(s);
    this.maxPolls.set(m);
  }

  saveTimeoutHours(h: number): void {
    const clamped = Math.max(1, Math.min(24, h));
    localStorage.setItem(TIMEOUT_KEY, String(clamped));
    this.sessionTimeoutHours.set(clamped);
  }

  saveNotifications(enabled: boolean): void {
    localStorage.setItem(NOTIF_KEY, String(enabled));
    this.notificationsEnabled.set(enabled);
  }

  saveToastDuration(sec: number): void {
    const s = Math.max(0, Math.min(60, sec));
    localStorage.setItem(TOAST_DURATION_KEY, String(s));
    this.toastDurationSec.set(s);
  }

  saveWebhook(url: string, enabled: boolean): void {
    localStorage.setItem(WEBHOOK_URL_KEY, url);
    localStorage.setItem(WEBHOOK_ENABLED_KEY, String(enabled));
    this.webhookUrl.set(url);
    this.webhookEnabled.set(enabled);
  }
}
