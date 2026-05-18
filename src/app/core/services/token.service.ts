import { Injectable, signal, computed } from '@angular/core';

const GITHUB_KEY          = 'cdm:github';
const DEVOPS_KEY          = 'cdm:devops';
const DEVOPS_ORG_KEY      = 'cdm:devops:org';
const DEVOPS_PROJECT_KEY  = 'cdm:devops:project';
const DEVOPS_TEAM_KEY     = 'cdm:devops:team';
const GITHUB_OWNER_KEY    = 'cdm:github:owner';
const TOKEN_EXPIRY_KEY    = 'cdm:expiry';
const PERSIST_KEY         = 'cdm:persist';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

const ALL_TOKEN_KEYS = [
  GITHUB_KEY, DEVOPS_KEY, DEVOPS_ORG_KEY,
  DEVOPS_PROJECT_KEY, DEVOPS_TEAM_KEY, GITHUB_OWNER_KEY,
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

  private readonly _persist        = signal<boolean>(localStorage.getItem(PERSIST_KEY) === '1');

  private readonly _githubToken    = signal<string | null>(initRead(GITHUB_KEY));
  private readonly _devopsToken    = signal<string | null>(initRead(DEVOPS_KEY));
  private readonly _devopsOrg      = signal<string | null>(initRead(DEVOPS_ORG_KEY));
  private readonly _devopsProject  = signal<string | null>(initRead(DEVOPS_PROJECT_KEY));
  private readonly _devopsTeam     = signal<string | null>(initRead(DEVOPS_TEAM_KEY));
  private readonly _githubOwner    = signal<string | null>(initRead(GITHUB_OWNER_KEY));

  // =========================================================
  // Readonly state
  // =========================================================

  readonly githubToken   = this._githubToken.asReadonly();
  readonly devopsToken   = this._devopsToken.asReadonly();
  readonly devopsOrg     = this._devopsOrg.asReadonly();
  readonly devopsProject = this._devopsProject.asReadonly();
  readonly devopsTeam    = this._devopsTeam.asReadonly();
  readonly githubOwner   = this._githubOwner.asReadonly();
  readonly persist       = this._persist.asReadonly();

  readonly hasGitHub   = computed(() => !!this._githubToken());
  readonly hasDevOps   = computed(() => !!this._devopsToken() && !!this._devopsOrg());
  readonly hasAnyToken = computed(() => this.hasGitHub() || this.hasDevOps());

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
    ALL_TOKEN_KEYS.forEach(k => {
      const v = sessionStorage.getItem(k);
      if (v !== null) localStorage.setItem(k, v);
    });
    localStorage.setItem(PERSIST_KEY, '1');
    this._persist.set(true);
  }

  disablePersist(): void {
    ALL_TOKEN_KEYS.forEach(k => {
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
    [DEVOPS_KEY, DEVOPS_ORG_KEY, DEVOPS_PROJECT_KEY, DEVOPS_TEAM_KEY]
      .forEach(k => this.store.removeItem(k));
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
    this.clearDevOps();
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    if (this._persist()) {
      localStorage.removeItem(PERSIST_KEY);
      this._persist.set(false);
    }
  }
}
