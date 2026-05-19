import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: 'settings', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'github-actions',
    loadComponent: () =>
      import('./features/github-actions/github-actions.component').then(
        (m) => m.GithubActionsComponent
      ),
  },
  {
    path: 'devops-boards',
    loadComponent: () =>
      import('./features/devops-boards/devops-boards.component').then(
        (m) => m.DevopsBoardsComponent
      ),
  },
  {
    path: 'chain-builder',
    loadComponent: () =>
      import('./features/chain-builder/chain-builder.component').then(
        (m) => m.ChainBuilderComponent
      ),
  },
  {
    path: 'chain-orchestrator',
    loadComponent: () =>
      import('./features/chain-orchestrator/chain-orchestrator.component').then(
        (m) => m.ChainOrchestratorComponent
      ),
  },
  {
    path: 'blockers',
    loadComponent: () =>
      import('./features/blockers/blockers.component').then((m) => m.BlockersComponent),
  },
  {
    path: 'releases',
    loadComponent: () =>
      import('./features/releases/releases.component').then((m) => m.ReleasesComponent),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./features/settings/settings.component').then((m) => m.SettingsComponent),
  },
  { path: '**', redirectTo: 'dashboard' },
];
