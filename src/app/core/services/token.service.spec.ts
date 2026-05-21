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

  describe('session expiry', () => {
    it('clears all tokens when session has already expired', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() - 1));
      sessionStorage.setItem('cdm:github', 'ghp_old');
      sessionStorage.setItem('cdm:github:owner', 'org');
      const svc = new TokenService();
      expect(svc.hasGitHub()).toBe(false);
      expect(sessionStorage.getItem('cdm:github')).toBeNull();
    });

    it('clears all tokens when expiry key is missing', () => {
      sessionStorage.setItem('cdm:github', 'ghp_old');
      const svc = new TokenService();
      expect(svc.hasGitHub()).toBe(false);
    });

    it('does NOT clear tokens when expiry is in the future', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() + 999_999));
      sessionStorage.setItem('cdm:github', 'ghp_valid');
      sessionStorage.setItem('cdm:github:owner', 'org');
      const svc = new TokenService();
      expect(svc.hasGitHub()).toBe(true);
    });
  });

  describe('restore from sessionStorage', () => {
    it('restores GitHub token and owner', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() + 1_000_000));
      sessionStorage.setItem('cdm:github', 'ghp_restored');
      sessionStorage.setItem('cdm:github:owner', 'my-org');
      const svc = new TokenService();
      expect(svc.hasGitHub()).toBe(true);
      expect(svc.githubOwner()).toBe('my-org');
    });

    it('restores GitLab token and URL', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() + 1_000_000));
      sessionStorage.setItem('cdm:gitlab', 'glpat_restored');
      sessionStorage.setItem('cdm:gitlab:url', 'https://gitlab.mycompany.com');
      const svc = new TokenService();
      expect(svc.hasGitLab()).toBe(true);
      expect(svc.gitlabBaseUrl()).toBe('https://gitlab.mycompany.com');
    });

    it('restores DevOps token and org', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() + 1_000_000));
      sessionStorage.setItem('cdm:devops', 'pat_restored');
      sessionStorage.setItem('cdm:devops:org', 'my-company');
      const svc = new TokenService();
      expect(svc.hasDevOps()).toBe(true);
      expect(svc.devopsOrg()).toBe('my-company');
    });

    it('restores Jira token, email and URL', () => {
      sessionStorage.setItem('cdm:expiry', String(Date.now() + 1_000_000));
      sessionStorage.setItem('cdm:jira', 'jira_restored');
      sessionStorage.setItem('cdm:jira:email', 'user@example.com');
      sessionStorage.setItem('cdm:jira:url', 'https://org.atlassian.net');
      const svc = new TokenService();
      expect(svc.hasJira()).toBe(true);
    });
  });

  describe('restore from localStorage (persist mode)', () => {
    it('restores GitHub token from localStorage when persist is enabled', () => {
      localStorage.setItem('cdm:persist', '1');
      localStorage.setItem('cdm:github', 'ghp_persisted');
      localStorage.setItem('cdm:github:owner', 'persisted-org');
      const svc = new TokenService();
      expect(svc.persist()).toBe(true);
      expect(svc.hasGitHub()).toBe(true);
      expect(svc.githubOwner()).toBe('persisted-org');
    });
  });

  describe('GitHub', () => {
    it('setGitHub() makes hasGitHub true and exposes owner', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'my-org');
      expect(svc.hasGitHub()).toBe(true);
      expect(svc.githubOwner()).toBe('my-org');
      expect(svc.hasAnyToken()).toBe(true);
    });

    it('hasGitHub is false when no token is set', () => {
      const svc = makeService();
      expect(svc.hasGitHub()).toBe(false);
    });

    it('setGitHub() records a savedAt timestamp', () => {
      const svc = makeService();
      const before = new Date().toISOString();
      svc.setGitHub('ghp_test', 'org');
      expect(svc.githubSavedAt()).not.toBeNull();
      expect(svc.githubSavedAt()! >= before).toBe(true);
    });

    it('setGitHub() persists savedAt to localStorage', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      expect(localStorage.getItem('cdm:github:saved_at')).not.toBeNull();
    });

    it('clearGitHub() removes token, owner and savedAt', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.clearGitHub();
      expect(svc.hasGitHub()).toBe(false);
      expect(svc.githubOwner()).toBeNull();
      expect(svc.githubSavedAt()).toBeNull();
      expect(localStorage.getItem('cdm:github:saved_at')).toBeNull();
    });
  });

  describe('GitLab', () => {
    it('setGitLab() makes hasGitLab true', () => {
      const svc = makeService();
      svc.setGitLab('glpat_test', 'https://gitlab.com');
      expect(svc.hasGitLab()).toBe(true);
      expect(svc.gitlabBaseUrl()).toBe('https://gitlab.com');
    });

    it('setGitLab() defaults baseUrl to https://gitlab.com', () => {
      const svc = makeService();
      svc.setGitLab('glpat_test');
      expect(svc.gitlabBaseUrl()).toBe('https://gitlab.com');
    });

    it('hasGitLab is false without a token', () => {
      const svc = makeService();
      expect(svc.hasGitLab()).toBe(false);
    });

    it('setGitLab() records a savedAt timestamp', () => {
      const svc = makeService();
      const before = new Date().toISOString();
      svc.setGitLab('glpat_test');
      expect(svc.gitlabSavedAt()).not.toBeNull();
      expect(svc.gitlabSavedAt()! >= before).toBe(true);
    });

    it('clearGitLab() removes token, URL and savedAt', () => {
      const svc = makeService();
      svc.setGitLab('glpat_test');
      svc.clearGitLab();
      expect(svc.hasGitLab()).toBe(false);
      expect(svc.gitlabBaseUrl()).toBeNull();
      expect(svc.gitlabSavedAt()).toBeNull();
    });
  });

  describe('Azure DevOps', () => {
    it('setDevOps() requires token and org for hasDevOps', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      expect(svc.hasDevOps()).toBe(true);
      expect(svc.devopsOrg()).toBe('my-company');
    });

    it('hasDevOps is false without an org', () => {
      const svc = makeService();
      sessionStorage.setItem('cdm:devops', 'pat_test');
      expect(svc.hasDevOps()).toBe(false);
    });

    it('updateDevOpsOrg() changes the org signal', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'original-org');
      svc.updateDevOpsOrg('new-org');
      expect(svc.devopsOrg()).toBe('new-org');
    });

    it('updateDevOpsProject() sets the project signal', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      svc.updateDevOpsProject('my-project');
      expect(svc.devopsProject()).toBe('my-project');
    });

    it('updateDevOpsTeam() sets the team signal', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      svc.updateDevOpsTeam('team-alpha');
      expect(svc.devopsTeam()).toBe('team-alpha');
    });

    it('clearDevOps() removes all devops data and savedAt', () => {
      const svc = makeService();
      svc.setDevOps('pat_test', 'my-company');
      svc.updateDevOpsProject('my-project');
      svc.updateDevOpsTeam('team-alpha');
      svc.clearDevOps();
      expect(svc.hasDevOps()).toBe(false);
      expect(svc.devopsOrg()).toBeNull();
      expect(svc.devopsProject()).toBeNull();
      expect(svc.devopsTeam()).toBeNull();
      expect(svc.devopsSavedAt()).toBeNull();
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

    it('hasJira is false without a baseUrl', () => {
      const svc = makeService();
      sessionStorage.setItem('cdm:jira', 'tok');
      sessionStorage.setItem('cdm:jira:email', 'user@example.com');
      expect(svc.hasJira()).toBe(false);
    });

    it('updateJiraProject() sets the project signal', () => {
      const svc = makeService();
      svc.setJira('tok', 'user@example.com', 'https://org.atlassian.net');
      svc.updateJiraProject('PROJ');
      expect(svc.jiraProject()).toBe('PROJ');
    });

    it('clearJira() removes all jira data and savedAt', () => {
      const svc = makeService();
      svc.setJira('jira_token', 'user@example.com', 'https://org.atlassian.net');
      svc.updateJiraProject('PROJ');
      svc.clearJira();
      expect(svc.hasJira()).toBe(false);
      expect(svc.jiraEmail()).toBeNull();
      expect(svc.jiraBaseUrl()).toBeNull();
      expect(svc.jiraProject()).toBeNull();
      expect(svc.jiraSavedAt()).toBeNull();
    });
  });

  describe('persist mode', () => {
    it('enablePersist() migrates sessionStorage tokens to localStorage', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      expect(sessionStorage.getItem('cdm:github')).toBe('ghp_test');
      svc.enablePersist();
      expect(localStorage.getItem('cdm:github')).toBe('ghp_test');
      expect(localStorage.getItem('cdm:persist')).toBe('1');
      expect(svc.persist()).toBe(true);
    });

    it('disablePersist() moves tokens back to sessionStorage and clears localStorage keys', () => {
      localStorage.setItem('cdm:persist', '1');
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.disablePersist();
      expect(svc.persist()).toBe(false);
      expect(localStorage.getItem('cdm:github')).toBeNull();
      expect(sessionStorage.getItem('cdm:github')).toBe('ghp_test');
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

    it('removes the session expiry key', () => {
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.clearAll();
      expect(sessionStorage.getItem('cdm:expiry')).toBeNull();
    });

    it('disables persist mode when it was active', () => {
      localStorage.setItem('cdm:persist', '1');
      const svc = makeService();
      svc.setGitHub('ghp_test', 'org');
      svc.clearAll();
      expect(svc.persist()).toBe(false);
      expect(localStorage.getItem('cdm:persist')).toBeNull();
    });
  });

  describe('active providers', () => {
    it('setActiveCiProvider() updates the signal to gitlab', () => {
      const svc = makeService();
      svc.setActiveCiProvider('gitlab');
      expect(svc.activeCiProvider()).toBe('gitlab');
    });

    it('setActiveCiProvider() updates the signal to github', () => {
      const svc = makeService();
      svc.setActiveCiProvider('github');
      expect(svc.activeCiProvider()).toBe('github');
    });

    it('setActiveBoardsProvider() updates the signal to jira', () => {
      const svc = makeService();
      svc.setActiveBoardsProvider('jira');
      expect(svc.activeBoardsProvider()).toBe('jira');
    });

    it('setActiveBoardsProvider() updates the signal to devops', () => {
      const svc = makeService();
      svc.setActiveBoardsProvider('devops');
      expect(svc.activeBoardsProvider()).toBe('devops');
    });
  });
});
