import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { TokenService } from '../services/token.service';

export const skipIfTokensGuard = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  if (tokens.hasAnyToken()) return router.createUrlTree(['/dashboard']);
  return true;
};

export const requireTokensGuard = () => {
  const tokens = inject(TokenService);
  const router = inject(Router);
  if (!tokens.hasAnyToken()) return router.createUrlTree(['/onboarding']);
  return true;
};
