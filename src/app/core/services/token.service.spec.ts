import { TokenService } from './token.service';

function makeService(): TokenService {
  sessionStorage.setItem('cdm:expiry', String(Date.now() + 1_000_000));
  return new TokenService();
}

describe('TokenService', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts with no tokens configured', () => {
    const svc = makeService();
    expect(svc.hasGitHub()).toBe(false);
    expect(svc.hasDevOps()).toBe(false);
    expect(svc.hasGitLab()).toBe(false);
    expect(svc.hasJira()).toBe(false);
    expect(svc.hasAnyToken()).toBe(false);
  });

  describe('GitHub', () => {
    it('setGitHub() makes hasGitHub true and exposes owner', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'my-org');
      expect(svc.hasGitHub()).toBe(true);
      expect(svc.githubOwner()).toBe('my-org');
      expect(svc.hasAnyToken()).toBe(true);
    });

    it('setGitHub() records a savedAt timestamp', () => {
      const svc = makeService();
      const before = new Date().toISOString();
      svc.setGitHub('ghp_test', 'org');
      expect(svc.githubSavedAt()).not.toBeNull();
      expect(svc.githubSavedAt()! >= before).toBe(true);
    });

    it('clearGitHub() removes token and owner', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.clearGitHub();
      expect(svc.hasGitHub()).toBe(false);
      expect(svc.githubOwner()).toBeNull();
      expect(svc.githubSavedAt()).toBeNull();
    });
  });

  describe('GitLab', () => {
    it('setGitLab() makes hasGitLab true', () => {
      const svc = makeService();
      svc.setGitLab('glpat_test', 'https://gitlab.com');
      expect(svc.hasGitLab()).toBe(true);
      expect(svc.gitlabBaseUrl()).toBe('https://gitlab.com');
    });

    it('clearGitLab() removes token', () => {
      const svc = makeService();
      svc.setGitLab('glpat_test');
      svc.clearGitLab();
      expect(svc.hasGitLab()).toBe(false);
    });
  });

  describe('Azure DevOps', () => {
    it('setDevOps() requires token and org for hasDevOps', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      expect(svc.hasDevOps()).toBe(true);
      expect(svc.devopsOrg()).toBe('my-company');
    });

    it('clearDevOps() removes all devops data', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      svc.clearDevOps();
      expect(svc.hasDevOps()).toBe(false);
      expect(svc.devopsOrg()).toBeNull();
    });
  });

  describe('Jira', () => {
    it('setJira() requires token, email and baseUrl for hasJira', () => {
      const svc = makeService();
      svc.setJira('jira_token', 'user@example.com', 'https://org.atlassian.net');
      expect(svc.hasJira()).toBe(true);
      expect(svc.jiraEmail()).toBe('user@example.com');
      expect(svc.jiraBaseUrl()).toBe('https://org.atlassian.net');
    });

    it('clearJira() removes all jira data', () => {
      const svc = makeService();
      svc.setJira('jira_token', 'user@example.com', 'https://org.atlassian.net');
      svc.clearJira();
      expect(svc.hasJira()).toBe(false);
    });
  });

  describe('persist mode', () => {
    it('enablePersist() migrates sessionStorage tokens to localStorage', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      expect(sessionStorage.getItem('cdm:github')).toBe('ghp_test');
      svc.enablePersist();
      expect(localStorage.getItem('cdm:github')).toBe('ghp_test');
      expect(svc.persist()).toBe(true);
    });

    it('disablePersist() moves tokens back to sessionStorage', () => {
      localStorage.setItem('cdm:persist', '1');
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.disablePersist();
      expect(svc.persist()).toBe(false);
      expect(localStorage.getItem('cdm:github')).toBeNull();
    });
  });

  describe('clearAll()', () => {
    it('removes every provider token', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.setGitLab('glpat_test');
      svc.setDevOps('pat', 'company');
      svc.setJira('tok', 'email@x.com', 'https://x.atlassian.net');
      svc.clearAll();
      expect(svc.hasAnyToken()).toBe(false);
    });
  });

  describe('active providers', () => {
    it('setActiveCiProvider() updates the signal', () => {
      const svc = makeService();
      svc.setActiveCiProvider('gitlab');
      expect(svc.activeCiProvider()).toBe('gitlab');
    });

    it('setActiveBoardsProvider() updates the signal', () => {
      const svc = makeService();
      svc.setActiveBoardsProvider('jira');
      expect(svc.activeBoardsProvider()).toBe('jira');
    });
  });
});
