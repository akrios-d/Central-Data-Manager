import { Injectable, signal } from '@angular/core';
import { ReleaseEnv, RepoEntry } from '../models/release.model';

const ENVS_KEY  = 'cdm:releases:envs';
const REPOS_KEY = 'cdm:releases:repos';

const DEFAULT_ENVS: ReleaseEnv[] = [
  { id: 'prod',    name: 'Production', order: 0 },
  { id: 'staging', name: 'Staging',    order: 1 },
  { id: 'dev',     name: 'Dev',        order: 2 },
];

@Injectable({ providedIn: 'root' })
export class ReleaseService {
  private readonly _envs  = signal<ReleaseEnv[]>(this.loadEnvs());
  private readonly _repos = signal<RepoEntry[]>(this.loadRepos());

  readonly envs  = this._envs.asReadonly();
  readonly repos = this._repos.asReadonly();

  private loadEnvs(): ReleaseEnv[] {
    try {
      const raw = localStorage.getItem(ENVS_KEY);
      return raw ? JSON.parse(raw) : structuredClone(DEFAULT_ENVS);
    } catch { return structuredClone(DEFAULT_ENVS); }
  }

  private loadRepos(): RepoEntry[] {
    try {
      const raw = localStorage.getItem(REPOS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  private saveEnvs():  void { localStorage.setItem(ENVS_KEY,  JSON.stringify(this._envs())); }
  private saveRepos(): void { localStorage.setItem(REPOS_KEY, JSON.stringify(this._repos())); }

  // ── Environments ────────────────────────────────────────────────────────────

  addEnv(name: string): void {
    const env: ReleaseEnv = { id: crypto.randomUUID(), name: name.trim(), order: this._envs().length };
    this._envs.update(list => [...list, env]);
    this.saveEnvs();
  }

  renameEnv(id: string, name: string): void {
    this._envs.update(list => list.map(e => e.id === id ? { ...e, name: name.trim() } : e));
    this.saveEnvs();
  }

  removeEnv(id: string): void {
    this._envs.update(list => list.filter(e => e.id !== id));
    this._repos.update(list => list.map(r => {
      const { [id]: _d, ...deps }    = r.deployments;
      const { [id]: _u, ...updated } = r.updatedAt;
      return { ...r, deployments: deps, updatedAt: updated };
    }));
    this.saveEnvs();
    this.saveRepos();
  }

  // ── Repositories ────────────────────────────────────────────────────────────

  addRepo(repoName: string): void {
    const repo: RepoEntry = {
      id: crypto.randomUUID(),
      repoName: repoName.trim(),
      deployments: {},
      updatedAt:   {},
    };
    this._repos.update(list => [...list, repo]);
    this.saveRepos();
  }

  removeRepo(id: string): void {
    this._repos.update(list => list.filter(r => r.id !== id));
    this.saveRepos();
  }

  // ── Deployments ─────────────────────────────────────────────────────────────

  setDeployment(repoId: string, envId: string, tag: string): void {
    this._repos.update(list => list.map(r => r.id !== repoId ? r : {
      ...r,
      deployments: { ...r.deployments, [envId]: tag },
      updatedAt:   { ...r.updatedAt,   [envId]: new Date().toISOString() },
    }));
    this.saveRepos();
  }

  clearDeployment(repoId: string, envId: string): void {
    this._repos.update(list => list.map(r => {
      if (r.id !== repoId) return r;
      const { [envId]: _d, ...deps }    = r.deployments;
      const { [envId]: _u, ...updated } = r.updatedAt;
      return { ...r, deployments: deps, updatedAt: updated };
    }));
    this.saveRepos();
  }
}
