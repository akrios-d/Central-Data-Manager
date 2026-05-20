import { Injectable, signal, computed } from '@angular/core';

const GITHUB_KEY = 'cdm:github';
const DEVOPS_KEY = 'cdm:devops';
const DEVOPS_ORG_KEY = 'cdm:devops:org';
const DEVOPS_PROJECT_KEY = 'cdm:devops:project';
const DEVOPS_TEAM_KEY = 'cdm:devops:team';
const GITHUB_OWNER_KEY = 'cdm:github:owner';
const GITLAB_KEY = 'cdm:gitlab';
const GITLAB_URL_KEY = 'cdm:gitlab:url';
const JIRA_KEY = 'cdm:jira';
const JIRA_EMAIL_KEY = 'cdm:jira:email';
const JIRA_URL_KEY = 'cdm:jira:url';
const JIRA_PROJECT_KEY = 'cdm:jira:project';
const ACTIVE_PROVIDER_KEY = 'cdm:active-provider';
const ACTIVE_BOARDS_KEY = 'cdm:active-boards';
const TOKEN_EXPIRY_KEY = 'cdm:expiry';
const PERSIST_KEY = 'cdm:persist';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

const ALL_TOKEN_KEYS = [
  GITHUB_KEY,
  DEVOPS_KEY,
  DEVOPS_ORG_KEY,
  DEVOPS_PROJECT_KEY,
  DEVOPS_TEAM_KEY,
  GITHUB_OWNER_KEY,
  GITLAB_KEY,
  GITLAB_URL_KEY,
  JIRA_KEY,
  JIRA_EMAIL_KEY,
  JIRA_URL_KEY,
  JIRA_PROJECT_KEY,
  ACTIVE_PROVIDER_KEY,
  ACTIVE_BOARDS_KEY,
];

function initRead(key: string): string | null {
  return (localStorage.getItem(PERSIST_KEY) === '1' ? localStorage : sessionStorage).getItem(key);
}

@Injectable({ providedIn: 'root' })
export class TokenService {
  constructor() {
    if (!this._persist()) this.validateSession();
  }

  private get store(): Storage {
    return this._persist() ? localStorage : sessionStorage;
  }

  // =========================================================
  // Signals
  // =========================================================

  private readonly _persist = signal<boolean>(localStorage.getItem(PERSIST_KEY) === '1');

  private readonly _githubToken = signal<string | null>(initRead(GITHUB_KEY));
  private readonly _devopsToken = signal<string | null>(initRead(DEVOPS_KEY));
  private readonly _devopsOrg = signal<string | null>(initRead(DEVOPS_ORG_KEY));
  private readonly _devopsProject = signal<string | null>(initRead(DEVOPS_PROJECT_KEY));
  private readonly _devopsTeam = signal<string | null>(initRead(DEVOPS_TEAM_KEY));
  private readonly _githubOwner = signal<string | null>(initRead(GITHUB_OWNER_KEY));
  private readonly _gitlabToken = signal<string | null>(initRead(GITLAB_KEY));
  private readonly _gitlabBaseUrl = signal<string | null>(initRead(GITLAB_URL_KEY));
  private readonly _jiraToken = signal<string | null>(initRead(JIRA_KEY));
  private readonly _jiraEmail = signal<string | null>(initRead(JIRA_EMAIL_KEY));
  private readonly _jiraBaseUrl = signal<string | null>(initRead(JIRA_URL_KEY));
  private readonly _jiraProject = signal<string | null>(initRead(JIRA_PROJECT_KEY));
  private readonly _activeProvider = signal<'github' | 'gitlab'>(
    (initRead(ACTIVE_PROVIDER_KEY) as 'github' | 'gitlab') ??
      (initRead(GITHUB_KEY) ? 'github' : 'gitlab'),
  );
  private readonly _activeBoardsProvider = signal<'devops' | 'jira'>(
    (initRead(ACTIVE_BOARDS_KEY) as 'devops' | 'jira') ??
      (initRead(DEVOPS_KEY) ? 'devops' : 'jira'),
  );

  // =========================================================
  // Readonly state
  // =========================================================

  readonly githubToken = this._githubToken.asReadonly();
  readonly devopsToken = this._devopsToken.asReadonly();
  readonly devopsOrg = this._devopsOrg.asReadonly();
  readonly devopsProject = this._devopsProject.asReadonly();
  readonly devopsTeam = this._devopsTeam.asReadonly();
  readonly githubOwner = this._githubOwner.asReadonly();
  readonly gitlabToken = this._gitlabToken.asReadonly();
  readonly gitlabBaseUrl = this._gitlabBaseUrl.asReadonly();
  readonly jiraToken = this._jiraToken.asReadonly();
  readonly jiraEmail = this._jiraEmail.asReadonly();
  readonly jiraBaseUrl = this._jiraBaseUrl.asReadonly();
  readonly jiraProject = this._jiraProject.asReadonly();
  readonly persist = this._persist.asReadonly();

  readonly hasGitHub = computed(() => !!this._githubToken());
  readonly hasDevOps = computed(() => !!this._devopsToken() && !!this._devopsOrg());
  readonly hasGitLab = computed(() => !!this._gitlabToken());
  readonly hasJira = computed(
    () => !!this._jiraToken() && !!this._jiraEmail() && !!this._jiraBaseUrl(),
  );
  readonly hasAnyToken = computed(
    () => this.hasGitHub() || this.hasDevOps() || this.hasGitLab() || this.hasJira(),
  );

  readonly activeCiProvider = this._activeProvider.asReadonly();
  readonly activeBoardsProvider = this._activeBoardsProvider.asReadonly();

  // =========================================================
  // Session helpers
  // =========================================================

  private createSession(): void {
    sessionStorage.setItem(TOKEN_EXPIRY_KEY, (Date.now() + SESSION_DURATION_MS).toString());
  }

  private validateSession(): void {
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
    if (!expiry || Date.now() > Number(expiry)) this.clearAll();
  }

  private refreshSession(): void {
    if (!this._persist()) this.createSession();
  }

  // =========================================================
  // Persist toggle
  // =========================================================

  enablePersist(): void {
    ALL_TOKEN_KEYS.forEach((k) => {
      const v = sessionStorage.getItem(k);
      if (v !== null) localStorage.setItem(k, v);
    });
    localStorage.setItem(PERSIST_KEY, '1');
    this._persist.set(true);
  }

  disablePersist(): void {
    ALL_TOKEN_KEYS.forEach((k) => {
      const v = localStorage.getItem(k);
      if (v !== null) sessionStorage.setItem(k, v);
      localStorage.removeItem(k);
    });
    localStorage.removeItem(PERSIST_KEY);
    this._persist.set(false);
    this.createSession();
  }

  // =========================================================
  // GitHub
  // =========================================================

  setGitHub(token: string, owner: string): void {
    this.store.setItem(GITHUB_KEY, token);
    this.store.setItem(GITHUB_OWNER_KEY, owner);
    this._githubToken.set(token);
    this._githubOwner.set(owner);
    this.refreshSession();
  }

  updateGitHubOwner(owner: string): void {
    this.store.setItem(GITHUB_OWNER_KEY, owner);
    this._githubOwner.set(owner);
    this.refreshSession();
  }

  clearGitHub(): void {
    this.store.removeItem(GITHUB_KEY);
    this.store.removeItem(GITHUB_OWNER_KEY);
    this._githubToken.set(null);
    this._githubOwner.set(null);
  }

  // =========================================================
  // GitLab
  // =========================================================

  setGitLab(token: string, baseUrl = 'https://gitlab.com'): void {
    this.store.setItem(GITLAB_KEY, token);
    this.store.setItem(GITLAB_URL_KEY, baseUrl);
    this._gitlabToken.set(token);
    this._gitlabBaseUrl.set(baseUrl);
    this.refreshSession();
  }

  clearGitLab(): void {
    this.store.removeItem(GITLAB_KEY);
    this.store.removeItem(GITLAB_URL_KEY);
    this._gitlabToken.set(null);
    this._gitlabBaseUrl.set(null);
  }

  setActiveCiProvider(p: 'github' | 'gitlab'): void {
    this.store.setItem(ACTIVE_PROVIDER_KEY, p);
    this._activeProvider.set(p);
  }

  setJira(token: string, email: string, baseUrl: string): void {
    this.store.setItem(JIRA_KEY, token);
    this.store.setItem(JIRA_EMAIL_KEY, email);
    this.store.setItem(JIRA_URL_KEY, baseUrl);
    this._jiraToken.set(token);
    this._jiraEmail.set(email);
    this._jiraBaseUrl.set(baseUrl);
    this.refreshSession();
  }

  updateJiraProject(project: string): void {
    this.store.setItem(JIRA_PROJECT_KEY, project);
    this._jiraProject.set(project);
  }

  clearJira(): void {
    [JIRA_KEY, JIRA_EMAIL_KEY, JIRA_URL_KEY, JIRA_PROJECT_KEY].forEach((k) =>
      this.store.removeItem(k),
    );
    this._jiraToken.set(null);
    this._jiraEmail.set(null);
    this._jiraBaseUrl.set(null);
    this._jiraProject.set(null);
  }

  setActiveBoardsProvider(p: 'devops' | 'jira'): void {
    this.store.setItem(ACTIVE_BOARDS_KEY, p);
    this._activeBoardsProvider.set(p);
  }

  // =========================================================
  // Azure DevOps
  // =========================================================

  setDevOps(token: string, org: string): void {
    this.store.setItem(DEVOPS_KEY, token);
    this.store.setItem(DEVOPS_ORG_KEY, org);
    this._devopsToken.set(token);
    this._devopsOrg.set(org);
    this.refreshSession();
  }

  updateDevOpsOrg(org: string): void {
    this.store.setItem(DEVOPS_ORG_KEY, org);
    this._devopsOrg.set(org);
    this.refreshSession();
  }

  updateDevOpsProject(project: string): void {
    this.store.setItem(DEVOPS_PROJECT_KEY, project);
    this._devopsProject.set(project);
    this.refreshSession();
  }

  updateDevOpsTeam(team: string): void {
    this.store.setItem(DEVOPS_TEAM_KEY, team);
    this._devopsTeam.set(team);
    this.refreshSession();
  }

  clearDevOps(): void {
    [DEVOPS_KEY, DEVOPS_ORG_KEY, DEVOPS_PROJECT_KEY, DEVOPS_TEAM_KEY].forEach((k) =>
      this.store.removeItem(k),
    );
    this._devopsToken.set(null);
    this._devopsOrg.set(null);
    this._devopsProject.set(null);
    this._devopsTeam.set(null);
  }

  // =========================================================
  // Global cleanup
  // =========================================================

  clearAll(): void {
    this.clearGitHub();
    this.clearGitLab();
    this.clearDevOps();
    this.clearJira();
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    if (this._persist()) {
      localStorage.removeItem(PERSIST_KEY);
      this._persist.set(false);
    }
  }
}
