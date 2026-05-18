import { Injectable, signal } from '@angular/core';

const POLL_KEY = 'cdm:poll_interval_s';
const MAX_KEY  = 'cdm:max_polls';

@Injectable({ providedIn: 'root' })
export class AppSettingsService {
  readonly pollIntervalSec = signal(Number(localStorage.getItem(POLL_KEY)) || 6);
  readonly maxPolls        = signal(Number(localStorage.getItem(MAX_KEY))  || 120);

  save(intervalSec: number, maxPolls: number): void {
    const s = Math.max(2, Math.min(60, intervalSec));
    const m = Math.max(10, Math.min(500, maxPolls));
    localStorage.setItem(POLL_KEY, String(s));
    localStorage.setItem(MAX_KEY,  String(m));
    this.pollIntervalSec.set(s);
    this.maxPolls.set(m);
  }
}
