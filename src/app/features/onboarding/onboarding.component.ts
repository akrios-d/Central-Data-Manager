import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TokenService } from '../../core/services/token.service';

@Component({
  selector: 'app-onboarding',
  imports: [FormsModule],
  templateUrl: './onboarding.component.html',
  styleUrl: './onboarding.component.scss',
})
export class OnboardingComponent {
  private tokens = inject(TokenService);
  private router = inject(Router);

  ghToken = signal('');
  ghOwner = signal('');
  adoToken = signal('');
  adoOrg = signal('');
  saved = signal(false);

  save(): void {
    const gh = this.ghToken().trim();
    const owner = this.ghOwner().trim();
    const ado = this.adoToken().trim();
    const org = this.adoOrg().trim();

    if (gh && owner) this.tokens.setGitHub(gh, owner);
    if (ado && org) this.tokens.setDevOps(ado, org);

    if (this.tokens.hasAnyToken()) {
      this.router.navigate(['/dashboard']);
    }
  }

  get canSave(): boolean {
    const ghValid = !!this.ghToken().trim() && !!this.ghOwner().trim();
    const adoValid = !!this.adoToken().trim() && !!this.adoOrg().trim();
    return ghValid || adoValid;
  }
}
