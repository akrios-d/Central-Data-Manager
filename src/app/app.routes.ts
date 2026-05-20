import { Routes } from '@angular/router';
import { skipIfTokensGuard, requireTokensGuard } from './core/guards/onboarding.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'onboarding', pathMatch: 'full' },
  {
    path: 'onboarding',
    canActivate: [skipIfTokensGuard],
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'dashboard',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'github-actions',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/github-actions/github-actions.component').then(
        (m) => m.GithubActionsComponent,
      ),
  },
  {
    path: 'devops-boards',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/devops-boards/devops-boards.component').then(
        (m) => m.DevopsBoardsComponent,
      ),
  },
  {
    path: 'chain-builder',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/chain-builder/chain-builder.component').then(
        (m) => m.ChainBuilderComponent,
      ),
  },
  {
    path: 'chain-orchestrator',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/chain-orchestrator/chain-orchestrator.component').then(
        (m) => m.ChainOrchestratorComponent,
      ),
  },
  {
    path: 'blockers',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/blockers/blockers.component').then((m) => m.BlockersComponent),
  },
  {
    path: 'releases',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/releases/releases.component').then((m) => m.ReleasesComponent),
  },
  {
    path: 'settings',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  {
    path: 'audit-log',
    canActivate: [requireTokensGuard],
    loadComponent: () =>
      import('./features/audit-log/audit-log.component').then((m) => m.AuditLogComponent),
  },
  { path: '**', redirectTo: 'onboarding' },
];
