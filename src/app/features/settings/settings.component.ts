import { Component, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TokenService } from '../../core/services/token.service';
import { ToastService } from '../../shared/services/toast.service';
import { DevOpsApiService, DevOpsTeam } from '../../core/services/devops-api.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent implements OnInit {
  private tokens = inject(TokenService);
  private router = inject(Router);
  private toasts = inject(ToastService);
  private ado    = inject(DevOpsApiService);

  readonly hasGh  = this.tokens.hasGitHub;
  readonly hasAdo = this.tokens.hasDevOps;
  readonly ghOwner      = this.tokens.githubOwner;
  readonly adoOrg       = this.tokens.devopsOrg;
  readonly adoProject   = this.tokens.devopsProject;
  readonly adoTeam      = this.tokens.devopsTeam;

  ghToken  = signal('');
  ghOwner2 = signal('');
  adoToken = signal('');
  adoOrg2  = signal('');

  editAdoOrg     = signal('');
  editAdoProject = signal('');
  editAdoTeam    = signal('');

  showGhForm      = signal(false);
  showAdoForm     = signal(false);
  showAdoOrgEdit  = signal(false);
  showSprintEdit  = signal(false);

  availableTeams = signal<DevOpsTeam[]>([]);
  teamsLoading   = signal(false);

  ngOnInit(): void {
    // pre-fill sprint edit fields with saved values
    this.editAdoProject.set(this.tokens.devopsProject() ?? '');
    this.editAdoTeam.set(this.tokens.devopsTeam() ?? '');
  }

  openAdoOrgEdit(): void {
    this.editAdoOrg.set(this.adoOrg() ?? '');
    this.showAdoOrgEdit.set(true);
  }

  saveAdoOrg(): void {
    const org = this.editAdoOrg().trim();
    if (org) {
      this.tokens.updateDevOpsOrg(org);
      this.showAdoOrgEdit.set(false);
      this.toasts.show('Organisation updated.', 'success');
    }
  }

  openSprintEdit(): void {
    this.editAdoProject.set(this.tokens.devopsProject() ?? '');
    this.editAdoTeam.set(this.tokens.devopsTeam() ?? '');
    this.showSprintEdit.set(true);
  }

  loadTeams(): void {
    const project = this.editAdoProject().trim();
    if (!project) return;
    this.teamsLoading.set(true);
    this.availableTeams.set([]);
    this.ado.listTeams(project).subscribe({
      next: (res) => { this.availableTeams.set(res.value); this.teamsLoading.set(false); },
      error: ()   => { this.teamsLoading.set(false); this.toasts.show('Could not load teams.', 'danger'); },
    });
  }

  saveSprintConfig(): void {
    const project = this.editAdoProject().trim();
    const team    = this.editAdoTeam().trim();
    if (project) this.tokens.updateDevOpsProject(project);
    if (team)    this.tokens.updateDevOpsTeam(team);
    this.showSprintEdit.set(false);
    this.toasts.show('Sprint config saved.', 'success');
  }

  saveGh(): void {
    if (this.ghToken().trim() && this.ghOwner2().trim()) {
      this.tokens.setGitHub(this.ghToken().trim(), this.ghOwner2().trim());
      this.ghToken.set('');
      this.ghOwner2.set('');
      this.showGhForm.set(false);
    }
  }

  saveAdo(): void {
    if (this.adoToken().trim() && this.adoOrg2().trim()) {
      this.tokens.setDevOps(this.adoToken().trim(), this.adoOrg2().trim());
      this.adoToken.set('');
      this.adoOrg2.set('');
      this.showAdoForm.set(false);
    }
  }

  clearGh(): void {
    this.toasts.confirm('Remove GitHub token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearGitHub();
      if (!this.tokens.hasAnyToken()) this.router.navigate(['/onboarding']);
      else this.toasts.show('GitHub token removed.', 'success');
    });
  }

  clearAdo(): void {
    this.toasts.confirm('Remove Azure DevOps token? This cannot be undone.', 'Yes, remove', () => {
      this.tokens.clearDevOps();
      if (!this.tokens.hasAnyToken()) this.router.navigate(['/onboarding']);
      else this.toasts.show('Azure DevOps token removed.', 'success');
    });
  }

  clearAll(): void {
    this.toasts.confirm('Clear ALL tokens? You will be redirected to Onboarding.', 'Yes, clear all', () => {
      this.tokens.clearAll();
      this.router.navigate(['/onboarding']);
    });
  }
}
