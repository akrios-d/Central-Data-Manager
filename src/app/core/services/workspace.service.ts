import { Injectable, inject } from '@angular/core';
import { ChainService } from './chain.service';
import { OrchestratorService } from './orchestrator.service';
import { ReleaseService } from './release.service';
import { TokenService } from './token.service';
import { AppSettingsService } from './app-settings.service';
import { AuditLogService } from './audit-log.service';

@Injectable({ providedIn: 'root' })
export class WorkspaceService {
  private readonly chainSvc = inject(ChainService);
  private readonly orchSvc = inject(OrchestratorService);
  private readonly releaseSvc = inject(ReleaseService);
  private readonly tokens = inject(TokenService);
  private readonly appSettings = inject(AppSettingsService);
  private readonly audit = inject(AuditLogService);

  exportWorkspace(): void {
    const data = {
      cdmVersion: '1',
      exportedAt: new Date().toISOString(),
      chains: this.chainSvc.chains(),
      graphs: this.orchSvc.graphs(),
      releaseEnvs: this.releaseSvc.envs(),
      releaseRepos: this.releaseSvc.repos(),
      settings: {
        pollIntervalSec: this.appSettings.pollIntervalSec(),
        maxPolls: this.appSettings.maxPolls(),
        sessionTimeoutHours: this.appSettings.sessionTimeoutHours(),
        activeCiProvider: this.tokens.activeCiProvider(),
        activeBoardsProvider: this.tokens.activeBoardsProvider(),
        devopsProject: this.tokens.devopsProject(),
        devopsTeam: this.tokens.devopsTeam(),
        jiraProject: this.tokens.jiraProject(),
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cdm-workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.audit.log('Workspace exported');
  }

  async importWorkspace(file: File): Promise<{ ok: boolean; error?: string }> {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.cdmVersion) return { ok: false, error: 'Invalid workspace file.' };

      if (Array.isArray(data.chains)) this.chainSvc.restoreAll(data.chains);
      if (Array.isArray(data.graphs)) this.orchSvc.restoreAll(data.graphs);
      if (Array.isArray(data.releaseEnvs) && Array.isArray(data.releaseRepos)) {
        this.releaseSvc.restoreAll(data.releaseEnvs, data.releaseRepos);
      }
      if (data.settings) this.restoreSettings(data.settings);

      this.audit.log('Workspace imported', file.name);
      return { ok: true };
    } catch {
      return { ok: false, error: 'Failed to parse workspace file.' };
    }
  }

  private restoreSettings(s: Record<string, unknown>): void {
    if (s['pollIntervalSec'] && s['maxPolls'])
      this.appSettings.save(s['pollIntervalSec'] as number, s['maxPolls'] as number);
    if (s['sessionTimeoutHours'])
      this.appSettings.saveTimeoutHours(s['sessionTimeoutHours'] as number);
    if (s['activeCiProvider'])
      this.tokens.setActiveCiProvider(s['activeCiProvider'] as 'github' | 'gitlab');
    if (s['activeBoardsProvider'])
      this.tokens.setActiveBoardsProvider(s['activeBoardsProvider'] as 'devops' | 'jira');
    if (s['devopsProject']) this.tokens.updateDevOpsProject(s['devopsProject'] as string);
    if (s['devopsTeam']) this.tokens.updateDevOpsTeam(s['devopsTeam'] as string);
    if (s['jiraProject']) this.tokens.updateJiraProject(s['jiraProject'] as string);
  }
}
