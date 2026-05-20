import { Injectable, computed, signal } from '@angular/core';

interface AppConfig {
  allowPersistentStorage: boolean;
  tokenMaxAgeDays: number;
}

const DEFAULTS: AppConfig = { allowPersistentStorage: true, tokenMaxAgeDays: 90 };

@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private readonly _config = signal<AppConfig>(DEFAULTS);

  readonly allowPersistentStorage = computed(() => this._config().allowPersistentStorage);
  readonly tokenMaxAgeDays = computed(() => this._config().tokenMaxAgeDays);

  load(): Promise<void> {
    return fetch('/config.json')
      .then((r) => r.json())
      .then((cfg: Partial<AppConfig>) => this._config.set({ ...DEFAULTS, ...cfg }))
      .catch(() => {});
  }
}
