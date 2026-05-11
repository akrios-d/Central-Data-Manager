import { Injectable, signal, computed } from '@angular/core';

const GITHUB_KEY = 'cdm:github';
const DEVOPS_KEY = 'cdm:devops';

const DEVOPS_ORG_KEY = 'cdm:devops:org';
const DEVOPS_PROJECT_KEY = 'cdm:devops:project';
const DEVOPS_TEAM_KEY = 'cdm:devops:team';

const GITHUB_OWNER_KEY = 'cdm:github:owner';

const TOKEN_EXPIRY_KEY = 'cdm:expiry';

/**
 * Session duration:
 * 8 hours
 */
const SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

@Injectable({ providedIn: 'root' })
export class TokenService {

  constructor() {
    this.validateSession();
  }

  // =========================================================
  // Signals
  // =========================================================

  private readonly _githubToken = signal<string | null>(
    sessionStorage.getItem(GITHUB_KEY)
  );

  private readonly _devopsToken = signal<string | null>(
    sessionStorage.getItem(DEVOPS_KEY)
  );

  private readonly _devopsOrg = signal<string | null>(
    sessionStorage.getItem(DEVOPS_ORG_KEY)
  );

  private readonly _devopsProject = signal<string | null>(
    sessionStorage.getItem(DEVOPS_PROJECT_KEY)
  );

  private readonly _devopsTeam = signal<string | null>(
    sessionStorage.getItem(DEVOPS_TEAM_KEY)
  );

  private readonly _githubOwner = signal<string | null>(
    sessionStorage.getItem(GITHUB_OWNER_KEY)
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

  readonly hasGitHub = computed(() => !!this._githubToken());

  readonly hasDevOps = computed(
    () => !!this._devopsToken() && !!this._devopsOrg()
  );

  readonly hasAnyToken = computed(
    () => this.hasGitHub() || this.hasDevOps()
  );

  // =========================================================
  // Session helpers
  // =========================================================

  private createSession(): void {
    const expiresAt = Date.now() + SESSION_DURATION_MS;

    sessionStorage.setItem(
      TOKEN_EXPIRY_KEY,
      expiresAt.toString()
    );
  }

  private validateSession(): void {
    const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);

    if (!expiry) {
      this.clearAll();
      return;
    }

    const expiresAt = Number(expiry);

    if (Date.now() > expiresAt) {
      this.clearAll();
    }
  }

  private refreshSession(): void {
    this.createSession();
  }

  // =========================================================
  // GitHub
  // =========================================================

  setGitHub(token: string, owner: string): void {

    sessionStorage.setItem(GITHUB_KEY, token);

    sessionStorage.setItem(
      GITHUB_OWNER_KEY,
      owner
    );

    this._githubToken.set(token);
    this._githubOwner.set(owner);

    this.refreshSession();
  }

  updateGitHubOwner(owner: string): void {

    sessionStorage.setItem(
      GITHUB_OWNER_KEY,
      owner
    );

    this._githubOwner.set(owner);

    this.refreshSession();
  }

  clearGitHub(): void {

    sessionStorage.removeItem(GITHUB_KEY);

    sessionStorage.removeItem(
      GITHUB_OWNER_KEY
    );

    this._githubToken.set(null);
    this._githubOwner.set(null);
  }

  // =========================================================
  // Azure DevOps
  // =========================================================

  setDevOps(token: string, org: string): void {

    sessionStorage.setItem(
      DEVOPS_KEY,
      token
    );

    sessionStorage.setItem(
      DEVOPS_ORG_KEY,
      org
    );

    this._devopsToken.set(token);
    this._devopsOrg.set(org);

    this.refreshSession();
  }

  updateDevOpsOrg(org: string): void {

    sessionStorage.setItem(
      DEVOPS_ORG_KEY,
      org
    );

    this._devopsOrg.set(org);

    this.refreshSession();
  }

  updateDevOpsProject(project: string): void {

    sessionStorage.setItem(
      DEVOPS_PROJECT_KEY,
      project
    );

    this._devopsProject.set(project);

    this.refreshSession();
  }

  updateDevOpsTeam(team: string): void {

    sessionStorage.setItem(
      DEVOPS_TEAM_KEY,
      team
    );

    this._devopsTeam.set(team);

    this.refreshSession();
  }

  clearDevOps(): void {

    [
      DEVOPS_KEY,
      DEVOPS_ORG_KEY,
      DEVOPS_PROJECT_KEY,
      DEVOPS_TEAM_KEY
    ].forEach((k) => {
      sessionStorage.removeItem(k);
    });

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

    sessionStorage.removeItem(
      TOKEN_EXPIRY_KEY
    );
  }
}
