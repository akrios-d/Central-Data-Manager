import { TestBed } from '@angular/core/testing';
import { TokenService } from './token.service';

describe('TokenService', () => {
  function create(): TokenService {
    TestBed.configureTestingModule({});
    return TestBed.inject(TokenService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
    sessionStorage.clear();
  });

  describe('initial state', () => {
    it('has no tokens by default', () => {
      const svc = create();
      expect(svc.hasGitHub()).toBe(false);
      expect(svc.hasDevOps()).toBe(false);
      expect(svc.hasGitLab()).toBe(false);
      expect(svc.hasJira()).toBe(false);
      expect(svc.hasAnyToken()).toBe(false);
    });
  });

  describe('GitHub', () => {
    it('setGitHub stores token and owner', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'my-org');
      expect(svc.hasGitHub()).toBe(true);
      expect(svc.githubToken()).toBe('ghp_abc');
      expect(svc.githubOwner()).toBe('my-org');
    });

    it('clearGitHub removes token and owner', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'my-org');
      svc.clearGitHub();
      expect(svc.hasGitHub()).toBe(false);
      expect(svc.githubToken()).toBeNull();
      expect(svc.githubOwner()).toBeNull();
    });

    it('updateGitHubOwner changes the owner only', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'old-org');
      svc.updateGitHubOwner('new-org');
      expect(svc.githubOwner()).toBe('new-org');
      expect(svc.githubToken()).toBe('ghp_abc');
    });
  });

  describe('Azure DevOps', () => {
    it('setDevOps stores token and org', () => {
      const svc = create();
      svc.setDevOps('pat_xyz', 'my-company');
      expect(svc.hasDevOps()).toBe(true);
      expect(svc.devopsToken()).toBe('pat_xyz');
      expect(svc.devopsOrg()).toBe('my-company');
    });

    it('clearDevOps removes all devops fields', () => {
      const svc = create();
      svc.setDevOps('pat_xyz', 'my-company');
      svc.updateDevOpsProject('my-project');
      svc.updateDevOpsTeam('my-team');
      svc.clearDevOps();
      expect(svc.hasDevOps()).toBe(false);
      expect(svc.devopsProject()).toBeNull();
      expect(svc.devopsTeam()).toBeNull();
    });

    it('hasDevOps requires both token and org', () => {
      const svc = create();
      svc.setDevOps('pat', '');
      expect(svc.hasDevOps()).toBe(false);
    });
  });

  describe('GitLab', () => {
    it('setGitLab stores token and url', () => {
      const svc = create();
      svc.setGitLab('glpat_abc', 'https://gitlab.example.com');
      expect(svc.hasGitLab()).toBe(true);
      expect(svc.gitlabToken()).toBe('glpat_abc');
      expect(svc.gitlabBaseUrl()).toBe('https://gitlab.example.com');
    });

    it('clearGitLab removes token', () => {
      const svc = create();
      svc.setGitLab('glpat_abc');
      svc.clearGitLab();
      expect(svc.hasGitLab()).toBe(false);
    });
  });

  describe('Jira', () => {
    it('setJira stores all three fields', () => {
      const svc = create();
      svc.setJira('tok', 'user@example.com', 'https://example.atlassian.net');
      expect(svc.hasJira()).toBe(true);
      expect(svc.jiraToken()).toBe('tok');
      expect(svc.jiraEmail()).toBe('user@example.com');
      expect(svc.jiraBaseUrl()).toBe('https://example.atlassian.net');
    });

    it('hasJira requires all three fields', () => {
      const svc = create();
      svc.setJira('tok', '', 'https://example.atlassian.net');
      expect(svc.hasJira()).toBe(false);
    });

    it('clearJira removes all jira fields', () => {
      const svc = create();
      svc.setJira('tok', 'user@example.com', 'https://example.atlassian.net');
      svc.updateJiraProject('PROJ');
      svc.clearJira();
      expect(svc.hasJira()).toBe(false);
      expect(svc.jiraProject()).toBeNull();
    });
  });

  describe('hasAnyToken', () => {
    it('returns true with only GitHub configured', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'org');
      expect(svc.hasAnyToken()).toBe(true);
    });

    it('returns false after clearAll', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'org');
      svc.setDevOps('pat', 'company');
      svc.clearAll();
      expect(svc.hasAnyToken()).toBe(false);
    });
  });

  describe('persist toggle', () => {
    it('defaults to false (session storage)', () => {
      const svc = create();
      expect(svc.persist()).toBe(false);
    });

    it('enablePersist migrates token to localStorage', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'org');
      svc.enablePersist();
      expect(svc.persist()).toBe(true);
      expect(localStorage.getItem('cdm:github')).toBe('ghp_abc');
    });

    it('disablePersist moves token back to sessionStorage', () => {
      const svc = create();
      svc.setGitHub('ghp_abc', 'org');
      svc.enablePersist();
      svc.disablePersist();
      expect(svc.persist()).toBe(false);
      expect(localStorage.getItem('cdm:github')).toBeNull();
      expect(sessionStorage.getItem('cdm:github')).toBe('ghp_abc');
    });
  });
});
