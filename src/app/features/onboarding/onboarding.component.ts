import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TokenService } from '../../core/services/token.service';
import { ToastService } from '../../shared/services/toast.service';

type Provider = 'github' | 'gitlab' | 'devops' | 'jira';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule, TranslateModule],
  templateUrl: './onboarding.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  private readonly tokens = inject(TokenService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly translate = inject(TranslateService);

  readonly hasGitHub = this.tokens.hasGitHub;
  readonly hasGitLab = this.tokens.hasGitLab;
  readonly hasDevOps = this.tokens.hasDevOps;
  readonly hasJira = this.tokens.hasJira;
  readonly hasAny = this.tokens.hasAnyToken;

  readonly currentLang = signal(localStorage.getItem('cdm_lang') ?? 'en');

  expanded = signal<Provider | null>(null);

  // GitHub
  ghToken = signal('');
  ghOwner = signal('');

  // GitLab
  glToken = signal('');
  glUrl = signal('https://gitlab.com');

  // Azure DevOps
  adoToken = signal('');
  adoOrg = signal('');

  // Jira
  jiraToken = signal('');
  jiraEmail = signal('');
  jiraUrl = signal('https://your-domain.atlassian.net');

  readonly canSaveGitHub = computed(() => !!this.ghToken().trim() && !!this.ghOwner().trim());
  readonly canSaveGitLab = computed(() => !!this.glToken().trim());
  readonly canSaveDevOps = computed(() => !!this.adoToken().trim() && !!this.adoOrg().trim());
  readonly canSaveJira = computed(
    () => !!this.jiraToken().trim() && !!this.jiraEmail().trim() && !!this.jiraUrl().trim(),
  );

  toggle(p: Provider): void {
    this.expanded.update((cur) => (cur === p ? null : p));
  }

  saveGitHub(): void {
    this.tokens.setGitHub(this.ghToken().trim(), this.ghOwner().trim());
    this.expanded.set(null);
    this.toasts.show(this.translate.instant('onboarding.savedGitHub'), 'success');
  }

  saveGitLab(): void {
    this.tokens.setGitLab(this.glToken().trim(), this.glUrl().trim() || 'https://gitlab.com');
    this.expanded.set(null);
    this.toasts.show(this.translate.instant('onboarding.savedGitLab'), 'success');
  }

  saveDevOps(): void {
    this.tokens.setDevOps(this.adoToken().trim(), this.adoOrg().trim());
    this.expanded.set(null);
    this.toasts.show(this.translate.instant('onboarding.savedDevOps'), 'success');
  }

  saveJira(): void {
    this.tokens.setJira(this.jiraToken().trim(), this.jiraEmail().trim(), this.jiraUrl().trim());
    this.expanded.set(null);
    this.toasts.show(this.translate.instant('onboarding.savedJira'), 'success');
  }

  enter(): void {
    this.router.navigate(['/dashboard']);
  }

  setLang(lang: string): void {
    this.translate.use(lang);
    this.currentLang.set(lang);
    localStorage.setItem('cdm_lang', lang);
  }
}
