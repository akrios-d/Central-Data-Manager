import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TokenService } from '../../core/services/token.service';
import { ToastService } from '../../shared/services/toast.service';
import { DevOpsApiService, DevOpsTeam } from '../../core/services/devops-api.service';
import { GitHubApiService, GhUser } from '../../core/services/github-api.service';
import { forkJoin } from 'rxjs';
import { catchError, of } from 'rxjs';

interface ConnectionTest {
  status: 'testing' | 'ok' | 'error';
  detail: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, TranslateModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private tokens    = inject(TokenService);
  private router    = inject(Router);
  private toasts    = inject(ToastService);
  private ado       = inject(DevOpsApiService);
  private gh        = inject(GitHubApiService);
  private translate = inject(TranslateService);

  readonly persist      = this.tokens.persist;
  readonly hasGh        = this.tokens.hasGitHub;
  readonly hasAdo       = this.tokens.hasDevOps;
  readonly ghOwner      = this.tokens.githubOwner;
  readonly adoOrg       = this.tokens.devopsOrg;
  readonly adoProject   = this.tokens.devopsProject;
  readonly adoTeam      = this.tokens.devopsTeam;

  ghToken  = signal('');
  ghOwner2 = signal('');
  adoToken = signal('');
  adoOrg2  = signal('');

  editAdoOrg     = signal('');
  editAdoProject = signal('');
  editAdoTeam    = signal('');

  showGhForm      = signal(false);
  showAdoForm     = signal(false);
  showAdoOrgEdit  = signal(false);
  showSprintEdit  = signal(false);

  availableTeams = signal<DevOpsTeam[]>([]);
  teamsLoading   = signal(false);

  ghTest  = signal<ConnectionTest | null>(null);
  adoTest = signal<ConnectionTest | null>(null);

  ngOnInit(): void {
    this.editAdoProject.set(this.tokens.devopsProject() ?? '');
    this.editAdoTeam.set(this.tokens.devopsTeam() ?? '');
  }

  testGitHub(): void {
    this.ghTest.set({ status: 'testing', detail: 'Connecting…' });

    forkJoin({
      user:  this.gh.getAuthenticatedUser(),
      repos: this.gh.listRepos().pipe(catchError(() => of([]))),
      orgs:  this.gh.listOrgs().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ user, repos, orgs }) => {
        const orgList = orgs.map((o: any) => o.login).join(', ');
        const lines = [
          `✓ Authenticated as ${user.login}`,
          `Repos visíveis via API: ${repos.length}`,
          orgs.length ? `Orgs: ${orgList}` : 'Sem orgs associadas',
        ];
        if (repos.length === 0 && orgs.length > 0) {
          lines.push('⚠ Se os repos estão numa org, pode precisar de autorizar o PAT nessa org (SSO/SAML).');
        }
        this.ghTest.set({ status: repos.length > 0 ? 'ok' : 'error', detail: lines.join(' · ') });
      },
      error: (e) => {
        const msg = e?.error?.message ?? e?.message ?? 'Request failed';
        this.ghTest.set({ status: 'error', detail: `✗ ${msg}` });
      },
    });
  }

  testDevOps(): void {
    this.adoTest.set({ status: 'testing', detail: 'Connecting…' });
    this.ado.listProjects().subscribe({
      next: (res) => {
        const names = res.value.slice(0, 3).map((p) => p.name).join(', ');
        this.adoTest.set({
          status: 'ok',
          detail: `✓ ${res.count} project(s) found: ${names}${res.count > 3 ? '…' : ''}`,
        });
      },
      error: (e) => {
        const msg = e?.error?.message ?? e?.message ?? 'Request failed';
        this.adoTest.set({ status: 'error', detail: `✗ ${msg}` });
      },
    });
  }

  openAdoOrgEdit(): void {
    this.editAdoOrg.set(this.adoOrg() ?? '');
    this.showAdoOrgEdit.set(true);
  }

  saveAdoOrg(): void {
    const org = this.editAdoOrg().trim();
    if (org) {
      this.tokens.updateDevOpsOrg(org);
      this.showAdoOrgEdit.set(false);
      this.toasts.show('Organisation updated.', 'success');
    }
  }

  openSprintEdit(): void {
    this.editAdoProject.set(this.tokens.devopsProject() ?? '');
    this.editAdoTeam.set(this.tokens.devopsTeam() ?? '');
    this.showSprintEdit.set(true);
  }

  loadTeams(): void {
    const project = this.editAdoProject().trim();
    if (!project) return;
    this.teamsLoading.set(true);
    this.availableTeams.set([]);
    this.ado.listTeams(project).subscribe({
      next: (res) => { this.availableTeams.set(res.value); this.teamsLoading.set(false); },
      error: ()   => { this.teamsLoading.set(false); this.toasts.show('Could not load teams.', 'danger'); },
    });
  }

  saveSprintConfig(): void {
    const project = this.editAdoProject().trim();
    const team    = this.editAdoTeam().trim();
    if (project) this.tokens.updateDevOpsProject(project);
    if (team)    this.tokens.updateDevOpsTeam(team);
    this.showSprintEdit.set(false);
    this.toasts.show('Sprint config saved.', 'success');
  }

  saveGh(): void {
    if (this.ghToken().trim() && this.ghOwner2().trim()) {
      this.tokens.setGitHub(this.ghToken().trim(), this.ghOwner2().trim());
      this.ghToken.set('');
      this.ghOwner2.set('');
      this.showGhForm.set(false);
      this.ghTest.set(null);
    }
  }

  saveAdo(): void {
    if (this.adoToken().trim() && this.adoOrg2().trim()) {
      this.tokens.setDevOps(this.adoToken().trim(), this.adoOrg2().trim());
      this.adoToken.set('');
      this.adoOrg2.set('');
      this.showAdoForm.set(false);
      this.adoTest.set(null);
    }
  }

  clearGh(): void {
    this.toasts.confirm('Remove GitHub token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearGitHub();
      this.ghTest.set(null);
      if (!this.tokens.hasAnyToken()) this.router.navigate(['/onboarding']);
      else this.toasts.show('GitHub token removed.', 'success');
    });
  }

  clearAdo(): void {
    this.toasts.confirm('Remove Azure DevOps token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearDevOps();
      this.adoTest.set(null);
      if (!this.tokens.hasAnyToken()) this.router.navigate(['/onboarding']);
      else this.toasts.show('Azure DevOps token removed.', 'success');
    });
  }

  clearAll(): void {
    this.toasts.confirm('Clear ALL tokens? You will be redirected to Onboarding.', 'Yes, clear all', () => {
      this.tokens.clearAll();
      this.router.navigate(['/onboarding']);
    });
  }

  requestEnablePersist(): void {
    const msg    = this.translate.instant('settings.storageRiskMsg');
    const label  = this.translate.instant('settings.storageRiskAccept');
    this.toasts.confirm(msg, label, () => {
      this.tokens.enablePersist();
      this.toasts.show(this.translate.instant('settings.storagePersistOn'), 'warning');
    });
  }

  disablePersist(): void {
    this.tokens.disablePersist();
    this.toasts.show(this.translate.instant('settings.storageSessionOn'), 'success');
  }
}
