import { Component, HostListener, inject, computed, signal } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TokenService } from './core/services/token.service';
import { ToastComponent } from './shared/components/toast/toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, TranslateModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private tokens    = inject(TokenService);
  private translate = inject(TranslateService);

  readonly showNav     = computed(() => this.tokens.hasAnyToken());
  readonly currentLang = signal(localStorage.getItem('cdm_lang') ?? 'en');
  readonly sidebarOpen = signal(false);

  constructor() {
    const saved = localStorage.getItem('cdm_lang') ?? 'en';
    this.translate.addLangs(['en', 'pt']);
    this.translate.setDefaultLang('en');
    this.translate.use(saved);
  }

  toggleSidebar(): void { this.sidebarOpen.update(v => !v); }
  closeSidebar(): void  { this.sidebarOpen.set(false); }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 768) this.sidebarOpen.set(false);
  }

  setLang(lang: string): void {
    this.translate.use(lang);
    this.currentLang.set(lang);
    localStorage.setItem('cdm_lang', lang);
  }
}
