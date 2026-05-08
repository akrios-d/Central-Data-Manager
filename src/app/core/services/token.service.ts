import { Injectable, signal, computed } from '@angular/core';

const GITHUB_KEY = 'cdm:github';
const DEVOPS_KEY = 'cdm:devops';
const DEVOPS_ORG_KEY = 'cdm:devops:org';
const DEVOPS_PROJECT_KEY = 'cdm:devops:project';
const DEVOPS_TEAM_KEY = 'cdm:devops:team';
const GITHUB_OWNER_KEY = 'cdm:github:owner';

@Injectable({ providedIn: 'root' })
export class TokenService {
  private _githubToken  = signal<string | null>(localStorage.getItem(GITHUB_KEY));
  private _devopsToken  = signal<string | null>(localStorage.getItem(DEVOPS_KEY));
  private _devopsOrg    = signal<string | null>(localStorage.getItem(DEVOPS_ORG_KEY));
  private _devopsProject= signal<string | null>(localStorage.getItem(DEVOPS_PROJECT_KEY));
  private _devopsTeam   = signal<string | null>(localStorage.getItem(DEVOPS_TEAM_KEY));
  private _githubOwner  = signal<string | null>(localStorage.getItem(GITHUB_OWNER_KEY));

  readonly githubToken   = this._githubToken.asReadonly();
  readonly devopsToken   = this._devopsToken.asReadonly();
  readonly devopsOrg     = this._devopsOrg.asReadonly();
  readonly devopsProject = this._devopsProject.asReadonly();
  readonly devopsTeam    = this._devopsTeam.asReadonly();
  readonly githubOwner   = this._githubOwner.asReadonly();

  readonly hasGitHub   = computed(() => !!this._githubToken());
  readonly hasDevOps   = computed(() => !!this._devopsToken() && !!this._devopsOrg());
  readonly hasAnyToken = computed(() => this.hasGitHub() || this.hasDevOps());

  setGitHub(token: string, owner: string): void {
    localStorage.setItem(GITHUB_KEY, token);
    localStorage.setItem(GITHUB_OWNER_KEY, owner);
    this._githubToken.set(token);
    this._githubOwner.set(owner);
  }

  setDevOps(token: string, org: string): void {
    localStorage.setItem(DEVOPS_KEY, token);
    localStorage.setItem(DEVOPS_ORG_KEY, org);
    this._devopsToken.set(token);
    this._devopsOrg.set(org);
  }

  updateDevOpsOrg(org: string): void {
    localStorage.setItem(DEVOPS_ORG_KEY, org);
    this._devopsOrg.set(org);
  }

  updateDevOpsProject(project: string): void {
    localStorage.setItem(DEVOPS_PROJECT_KEY, project);
    this._devopsProject.set(project);
  }

  updateDevOpsTeam(team: string): void {
    localStorage.setItem(DEVOPS_TEAM_KEY, team);
    this._devopsTeam.set(team);
  }

  updateGitHubOwner(owner: string): void {
    localStorage.setItem(GITHUB_OWNER_KEY, owner);
    this._githubOwner.set(owner);
  }

  clearGitHub(): void {
    localStorage.removeItem(GITHUB_KEY);
    localStorage.removeItem(GITHUB_OWNER_KEY);
    this._githubToken.set(null);
    this._githubOwner.set(null);
  }

  clearDevOps(): void {
    [DEVOPS_KEY, DEVOPS_ORG_KEY, DEVOPS_PROJECT_KEY, DEVOPS_TEAM_KEY].forEach((k) =>
      localStorage.removeItem(k)
    );
    this._devopsToken.set(null);
    this._devopsOrg.set(null);
    this._devopsProject.set(null);
    this._devopsTeam.set(null);
  }

  clearAll(): void {
    this.clearGitHub();
    this.clearDevOps();
  }
}
