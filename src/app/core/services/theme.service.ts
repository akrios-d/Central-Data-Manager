import { Injectable, effect, signal } from '@angular/core';

export type Theme = 'dark' | 'light';
const THEME_KEY = 'cdm:theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>((localStorage.getItem(THEME_KEY) as Theme) ?? 'dark');

  constructor() {
    document.documentElement.classList.toggle('light', this.theme() === 'light');

    effect(() => {
      const t = this.theme();
      document.documentElement.classList.toggle('light', t === 'light');
      localStorage.setItem(THEME_KEY, t);
    });
  }

  toggle(): void {
    this.theme.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }
}
