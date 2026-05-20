import { TestBed } from '@angular/core/testing';
import { ReleaseService } from './release.service';

describe('ReleaseService', () => {
  let svc: ReleaseService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    svc = TestBed.inject(ReleaseService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  describe('environments', () => {
    it('loads 3 default envs on fresh state', () => {
      expect(svc.envs()).toHaveLength(3);
      expect(svc.envs().map((e) => e.id)).toEqual(['prod', 'staging', 'dev']);
    });

    it('addEnv appends with correct name', () => {
      svc.addEnv('QA');
      expect(svc.envs()).toHaveLength(4);
      expect(svc.envs().at(-1)?.name).toBe('QA');
    });

    it('addEnv trims whitespace', () => {
      svc.addEnv('  QA  ');
      expect(svc.envs().at(-1)?.name).toBe('QA');
    });

    it('renameEnv updates the name', () => {
      const { id } = svc.envs()[0];
      svc.renameEnv(id, 'PROD');
      expect(svc.envs()[0].name).toBe('PROD');
    });

    it('removeEnv deletes the env', () => {
      const { id } = svc.envs()[0];
      svc.removeEnv(id);
      expect(svc.envs()).toHaveLength(2);
      expect(svc.envs().find((e) => e.id === id)).toBeUndefined();
    });
  });

  describe('repositories', () => {
    it('starts with no repos', () => {
      expect(svc.repos()).toHaveLength(0);
    });

    it('addRepo appends a repository', () => {
      svc.addRepo('my-org/my-repo');
      expect(svc.repos()).toHaveLength(1);
      expect(svc.repos()[0].repoName).toBe('my-org/my-repo');
    });

    it('addRepo trims whitespace', () => {
      svc.addRepo('  my-org/my-repo  ');
      expect(svc.repos()[0].repoName).toBe('my-org/my-repo');
    });

    it('addRepo defaults provider to github', () => {
      svc.addRepo('my-org/my-repo');
      expect(svc.repos()[0].provider).toBe('github');
    });

    it('removeRepo deletes by id', () => {
      svc.addRepo('my-org/my-repo');
      const { id } = svc.repos()[0];
      svc.removeRepo(id);
      expect(svc.repos()).toHaveLength(0);
    });
  });

  describe('deployments', () => {
    let repoId: string;
    let envId: string;

    beforeEach(() => {
      svc.addRepo('my-org/my-repo');
      repoId = svc.repos()[0].id;
      envId = svc.envs()[0].id; // prod
    });

    it('setDeployment records a tag for repo+env', () => {
      svc.setDeployment(repoId, envId, 'v1.2.3');
      expect(svc.repos()[0].deployments[envId]).toBe('v1.2.3');
    });

    it('setDeployment updates updatedAt timestamp', () => {
      svc.setDeployment(repoId, envId, 'v1.0.0');
      expect(svc.repos()[0].updatedAt[envId]).toBeTruthy();
    });

    it('clearDeployment removes the tag', () => {
      svc.setDeployment(repoId, envId, 'v1.2.3');
      svc.clearDeployment(repoId, envId);
      expect(svc.repos()[0].deployments[envId]).toBeUndefined();
    });

    it('removeEnv clears related deployments from all repos', () => {
      svc.setDeployment(repoId, envId, 'v1.0.0');
      svc.removeEnv(envId);
      expect(svc.repos()[0].deployments[envId]).toBeUndefined();
      expect(svc.repos()[0].updatedAt[envId]).toBeUndefined();
    });
  });

  describe('persistence', () => {
    it('persists envs to localStorage', () => {
      svc.addEnv('QA');
      const raw = localStorage.getItem('cdm:releases:envs');
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.find((e: { name: string }) => e.name === 'QA')).toBeTruthy();
    });

    it('persists repos to localStorage', () => {
      svc.addRepo('my-org/my-repo');
      const raw = localStorage.getItem('cdm:releases:repos');
      expect(JSON.parse(raw!)).toHaveLength(1);
    });
  });
});
