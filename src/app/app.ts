import { Component, HostListener, inject, computed, signal } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TokenService } from './core/services/token.service';
import { SessionTimeoutService } from './core/services/session-timeout.service';
import { ThemeService } from './core/services/theme.service';
import { ToastComponent } from './shared/components/toast/toast.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, TranslateModule],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly tokens = inject(TokenService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly sessionTimeout = inject(SessionTimeoutService);
  private readonly themeService = inject(ThemeService);

  readonly showNav = computed(() => this.tokens.hasAnyToken());
  readonly currentLang = signal(localStorage.getItem('cdm_lang') ?? 'en');
  readonly sidebarOpen = signal(false);
  readonly sessionExpired = this.sessionTimeout.expired;
  readonly theme = this.themeService.theme;

  constructor() {
    const saved = localStorage.getItem('cdm_lang') ?? 'en';
    this.translate.addLangs(['en', 'pt', 'fr', 'zh']);
    this.translate.setDefaultLang('en');
    this.translate.use(saved);
    this.sessionTimeout.init();
  }

  goToSettings(): void {
    this.sessionTimeout.dismiss();
    this.router.navigate(['/settings']);
  }

  toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }
  closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  @HostListener('window:resize')
  onResize(): void {
    if (window.innerWidth > 768) this.sidebarOpen.set(false);
  }

  setLang(lang: string): void {
    this.translate.use(lang);
    this.currentLang.set(lang);
    localStorage.setItem('cdm_lang', lang);
  }

  toggleTheme(): void {
    this.themeService.toggle();
  }
}
