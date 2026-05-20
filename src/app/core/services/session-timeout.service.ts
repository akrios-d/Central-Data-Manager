import { Injectable, inject, signal } from '@angular/core';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';
import { TokenService } from './token.service';

const ACTIVITY_KEY = 'cdm:last_activity';
const CHECK_INTERVAL_MS = 60_000;
const WRITE_THROTTLE_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private readonly tokens = inject(TokenService);
  private readonly settings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);

  readonly expired = signal(false);
  private lastWrite = 0;

  init(): void {
    this.updateActivity();
    (['click', 'keydown', 'mousemove', 'touchstart'] as const).forEach((ev) =>
      document.addEventListener(ev, () => this.updateActivity(), { passive: true }),
    );
    setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  dismiss(): void {
    this.expired.set(false);
    this.updateActivity();
  }

  private updateActivity(): void {
    if (this.tokens.persist()) return;
    const now = Date.now();
    if (now - this.lastWrite < WRITE_THROTTLE_MS) return;
    this.lastWrite = now;
    sessionStorage.setItem(ACTIVITY_KEY, now.toString());
  }

  private check(): void {
    if (this.expired() || this.tokens.persist()) return;
    const last = Number(sessionStorage.getItem(ACTIVITY_KEY) ?? 0);
    const timeoutMs = this.settings.sessionTimeoutHours() * 3_600_000;
    if (Date.now() - last > timeoutMs) {
      this.audit.log('Session expired', 'Inactivity timeout reached');
      this.tokens.clearAll();
      this.expired.set(true);
    }
  }
}
