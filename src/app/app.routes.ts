import { Routes } from '@angular/router';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TokenService } from './core/services/token.service';

const tokenGuard = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  return tokens.hasAnyToken() ? true : router.createUrlTree(['/onboarding']);
};

export const routes: Routes = [
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./features/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
  },
  {
    path: 'dashboard',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
  },
  {
    path: 'github-actions',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/github-actions/github-actions.component').then(
        (m) => m.GithubActionsComponent
      ),
  },
  {
    path: 'devops-boards',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/devops-boards/devops-boards.component').then(
        (m) => m.DevopsBoardsComponent
      ),
  },
  {
    path: 'pipeline-runner',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/pipeline-runner/pipeline-runner.component').then(
        (m) => m.PipelineRunnerComponent
      ),
  },
  {
    path: 'chain-builder',
    canActivate: [tokenGuard],
    loadComponent: () =>
      import('./features/chain-builder/chain-builder.component').then(
        (m) => m.ChainBuilderComponent
      ),
  },
  {
    path: 'releases',
    canActivate: [tokenGuard],
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
