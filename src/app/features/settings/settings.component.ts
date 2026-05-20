import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { TokenService } from '../../core/services/token.service';
import { ToastService } from '../../shared/services/toast.service';
import { AppSettingsService } from '../../core/services/app-settings.service';
import { AuditLogService } from '../../core/services/audit-log.service';
import {
  DevOpsApiService,
  DevOpsProject,
  DevOpsTeam,
} from '../../core/services/devops-api.service';
import { GitHubApiService } from '../../core/services/github-api.service';
import { GitLabApiService } from '../../core/services/gitlab-api.service';
import { JiraApiService } from '../../core/services/jira-api.service';
import { forkJoin, catchError, of } from 'rxjs';

interface ConnectionTest {
  status: 'testing' | 'ok' | 'error';
  detail: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, TranslateModule, DatePipe],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private tokens = inject(TokenService);
  private toasts = inject(ToastService);
  private ado = inject(DevOpsApiService);
  private gh = inject(GitHubApiService);
  private gl = inject(GitLabApiService);
  private jira = inject(JiraApiService);
  private translate = inject(TranslateService);
  private appSettings = inject(AppSettingsService);

  readonly persist = this.tokens.persist;
  readonly hasGh = this.tokens.hasGitHub;
  readonly hasAdo = this.tokens.hasDevOps;
  readonly hasGl = this.tokens.hasGitLab;
  readonly activeCiProvider = this.tokens.activeCiProvider;
  readonly activeBoardsProvider = this.tokens.activeBoardsProvider;
  readonly hasJira = this.tokens.hasJira;
  readonly jiraEmail2 = this.tokens.jiraEmail;
  readonly jiraBaseUrl2 = this.tokens.jiraBaseUrl;

  jiraToken = signal('');
  jiraEmail = signal('');
  jiraUrl = signal('https://your-domain.atlassian.net');
  showJiraForm = signal(false);
  jiraTest = signal<ConnectionTest | null>(null);

  readonly jiraProject = this.tokens.jiraProject;
  jiraProject2 = signal('');
  showJiraProjectEdit = signal(false);
  availableJiraProjects = signal<{ id: string; key: string; name: string }[]>([]);
  jiraProjectsLoading = signal(false);

  setProvider(p: 'github' | 'gitlab'): void {
    this.tokens.setActiveCiProvider(p);
  }
  setBoardsProvider(p: 'devops' | 'jira'): void {
    this.tokens.setActiveBoardsProvider(p);
  }
  readonly ghOwner = this.tokens.githubOwner;
  readonly adoOrg = this.tokens.devopsOrg;
  readonly adoProject = this.tokens.devopsProject;
  readonly adoTeam = this.tokens.devopsTeam;
  readonly glBaseUrl = this.tokens.gitlabBaseUrl;

  readonly audit = inject(AuditLogService);

  editPollInterval = signal(this.appSettings.pollIntervalSec());
  editMaxPolls = signal(this.appSettings.maxPolls());
  editTimeoutHours = signal(this.appSettings.sessionTimeoutHours());
  readonly maxPollMinutes = computed(() =>
    Math.round((this.editPollInterval() * this.editMaxPolls()) / 60),
  );

  ghToken = signal('');
  ghOwner2 = signal('');
  adoToken = signal('');
  adoOrg2 = signal('');
  glToken = signal('');
  glUrl = signal('https://gitlab.com');

  editAdoOrg = signal('');
  editAdoProject = signal('');
  editAdoTeam = signal('');

  showGhForm = signal(false);
  showAdoForm = signal(false);
  showAdoOrgEdit = signal(false);
  showSprintEdit = signal(false);
  showGlForm = signal(false);

  availableProjects = signal<DevOpsProject[]>([]);
  projectsLoading = signal(false);
  availableTeams = signal<DevOpsTeam[]>([]);
  teamsLoading = signal(false);

  ghTest = signal<ConnectionTest | null>(null);
  adoTest = signal<ConnectionTest | null>(null);
  glTest = signal<ConnectionTest | null>(null);

  ngOnInit(): void {
    this.editAdoProject.set(this.tokens.devopsProject() ?? '');
    this.editAdoTeam.set(this.tokens.devopsTeam() ?? '');
    this.glUrl.set(this.tokens.gitlabBaseUrl() ?? 'https://gitlab.com');
    this.jiraUrl.set(this.tokens.jiraBaseUrl() ?? 'https://your-domain.atlassian.net');
    if (this.tokens.jiraEmail()) this.jiraEmail.set(this.tokens.jiraEmail()!);
  }

  testGitHub(): void {
    this.ghTest.set({ status: 'testing', detail: 'Connecting…' });
    forkJoin({
      user: this.gh.getAuthenticatedUser(),
      repos: this.gh.listRepos().pipe(catchError(() => of([]))),
      orgs: this.gh.listOrgs().pipe(catchError(() => of([]))),
    }).subscribe({
      next: ({ user, repos, orgs }) => {
        const orgList = orgs.map((o: any) => o.login).join(', ');
        const lines = [
          `✓ Authenticated as ${user.login}`,
          `Repos visíveis via API: ${repos.length}`,
          orgs.length ? `Orgs: ${orgList}` : 'Sem orgs associadas',
        ];
        if (repos.length === 0 && orgs.length > 0) {
          lines.push(
            '⚠ Se os repos estão numa org, pode precisar de autorizar o PAT nessa org (SSO/SAML).',
          );
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
        const names = res.value
          .slice(0, 3)
          .map((p) => p.name)
          .join(', ');
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

  testGitLab(): void {
    this.glTest.set({ status: 'testing', detail: 'Connecting…' });
    this.gl.listProjects().subscribe({
      next: (projects) => {
        this.glTest.set({ status: 'ok', detail: `✓ ${projects.length} project(s) accessible` });
      },
      error: (e) => {
        const msg = e?.error?.message ?? e?.message ?? 'Request failed';
        this.glTest.set({ status: 'error', detail: `✗ ${msg}` });
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
    this.availableTeams.set([]);
    this.showSprintEdit.set(true);
    this.loadProjects();
  }

  loadProjects(): void {
    this.projectsLoading.set(true);
    this.availableProjects.set([]);
    this.ado.listProjects().subscribe({
      next: (res) => {
        this.availableProjects.set(res.value);
        this.projectsLoading.set(false);
        if (this.editAdoProject()) this.loadTeams();
      },
      error: () => {
        this.projectsLoading.set(false);
        this.toasts.show('Could not load projects.', 'danger');
      },
    });
  }

  onProjectChange(name: string): void {
    this.editAdoProject.set(name);
    this.editAdoTeam.set('');
    this.availableTeams.set([]);
    if (name) this.loadTeams();
  }

  loadTeams(): void {
    const project = this.editAdoProject().trim();
    if (!project) return;
    this.teamsLoading.set(true);
    this.availableTeams.set([]);
    this.ado.listTeams(project).subscribe({
      next: (res) => {
        this.availableTeams.set(res.value);
        this.teamsLoading.set(false);
      },
      error: () => {
        this.teamsLoading.set(false);
        this.toasts.show('Could not load teams.', 'danger');
      },
    });
  }

  saveSprintConfig(): void {
    const project = this.editAdoProject().trim();
    const team = this.editAdoTeam().trim();
    if (project) this.tokens.updateDevOpsProject(project);
    if (team) this.tokens.updateDevOpsTeam(team);
    this.showSprintEdit.set(false);
    this.toasts.show('Sprint config saved.', 'success');
  }

  saveGh(): void {
    if (this.ghToken().trim() && this.ghOwner2().trim()) {
      this.tokens.setGitHub(this.ghToken().trim(), this.ghOwner2().trim());
      this.audit.log('Token saved', 'GitHub');
      this.ghToken.set('');
      this.ghOwner2.set('');
      this.showGhForm.set(false);
      this.ghTest.set(null);
    }
  }

  saveAdo(): void {
    if (this.adoToken().trim() && this.adoOrg2().trim()) {
      this.tokens.setDevOps(this.adoToken().trim(), this.adoOrg2().trim());
      this.audit.log('Token saved', 'Azure DevOps');
      this.adoToken.set('');
      this.adoOrg2.set('');
      this.showAdoForm.set(false);
      this.adoTest.set(null);
    }
  }

  saveGl(): void {
    const token = this.glToken().trim();
    const url = this.glUrl().trim() || 'https://gitlab.com';
    if (token) {
      this.tokens.setGitLab(token, url);
      this.audit.log('Token saved', 'GitLab');
      this.glToken.set('');
      this.showGlForm.set(false);
      this.glTest.set(null);
    }
  }

  clearGh(): void {
    this.toasts.confirm('Remove GitHub token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearGitHub();
      this.ghTest.set(null);
      this.audit.log('Token removed', 'GitHub');
      this.toasts.show('GitHub token removed.', 'success');
    });
  }

  clearAdo(): void {
    this.toasts.confirm('Remove Azure DevOps token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearDevOps();
      this.adoTest.set(null);
      this.audit.log('Token removed', 'Azure DevOps');
      this.toasts.show('Azure DevOps token removed.', 'success');
    });
  }

  clearGl(): void {
    this.toasts.confirm('Remove GitLab token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearGitLab();
      this.glTest.set(null);
      this.audit.log('Token removed', 'GitLab');
      this.toasts.show('GitLab token removed.', 'success');
    });
  }

  clearAll(): void {
    this.toasts.confirm('Clear ALL tokens?', 'Yes, clear all', () => {
      this.audit.log('All tokens cleared');
      this.tokens.clearAll();
      this.toasts.show('All tokens cleared.', 'success');
    });
  }

  testJira(): void {
    this.jiraTest.set({ status: 'testing', detail: 'Connecting…' });
    this.jira.getMyself().subscribe({
      next: (user) => {
        this.jiraTest.set({
          status: 'ok',
          detail: `✓ Authenticated as ${user.displayName} (${user.emailAddress})`,
        });
      },
      error: (e) => {
        const msg = e?.error?.message ?? e?.message ?? 'Request failed';
        this.jiraTest.set({ status: 'error', detail: `✗ ${msg}` });
      },
    });
  }

  saveJira(): void {
    const token = this.jiraToken().trim();
    const email = this.jiraEmail().trim();
    const url = this.jiraUrl().trim();
    if (token && email && url) {
      this.tokens.setJira(token, email, url);
      this.audit.log('Token saved', 'Jira');
      this.jiraToken.set('');
      this.jiraEmail.set('');
      this.showJiraForm.set(false);
      this.jiraTest.set(null);
    }
  }

  openJiraProjectEdit(): void {
    this.jiraProject2.set(this.tokens.jiraProject() ?? '');
    this.jiraProjectsLoading.set(true);
    this.availableJiraProjects.set([]);
    this.showJiraProjectEdit.set(true);
    this.jira.listProjects().subscribe({
      next: (ps) => {
        this.availableJiraProjects.set(ps);
        this.jiraProjectsLoading.set(false);
      },
      error: () => {
        this.jiraProjectsLoading.set(false);
        this.toasts.show('Could not load Jira projects.', 'danger');
      },
    });
  }

  saveJiraProject(): void {
    const project = this.jiraProject2().trim();
    if (project) {
      this.tokens.updateJiraProject(project);
      this.showJiraProjectEdit.set(false);
      this.toasts.show('Jira project saved.', 'success');
    }
  }

  clearJira(): void {
    this.toasts.confirm('Remove Jira token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearJira();
      this.jiraTest.set(null);
      this.toasts.show('Jira token removed.', 'success');
    });
  }

  saveExecSettings(): void {
    this.appSettings.save(this.editPollInterval(), this.editMaxPolls());
    this.appSettings.saveTimeoutHours(this.editTimeoutHours());
    this.audit.log('Execution settings saved');
    this.toasts.show(this.translate.instant('settings.execSettingsSaved'), 'success');
  }

  requestEnablePersist(): void {
    const msg = this.translate.instant('settings.storageRiskMsg');
    const label = this.translate.instant('settings.storageRiskAccept');
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
