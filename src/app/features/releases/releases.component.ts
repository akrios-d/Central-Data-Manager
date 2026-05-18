import { Component, ElementRef, inject, signal, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ReleaseService } from '../../core/services/release.service';
import { GitHubApiService } from '../../core/services/github-api.service';
import { ToastService } from '../../shared/services/toast.service';

interface EditTarget { repoId: string; envId: string; }

@Component({
  selector: 'app-releases',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  templateUrl: './releases.component.html',
  styleUrl:    './releases.component.scss',
})
export class ReleasesComponent {
  private readonly svc    = inject(ReleaseService);
  private readonly gh     = inject(GitHubApiService);
  private readonly toasts = inject(ToastService);
  private readonly el     = inject(ElementRef);

  readonly envs  = this.svc.envs;
  readonly repos = this.svc.repos;

  // ── Inline cell edit ────────────────────────────────────────────────────────
  editTarget = signal<EditTarget | null>(null);
  editValue  = signal('');

  // ── Tag suggestions cache ───────────────────────────────────────────────────
  private tagsCache = new Map<string, string[]>();
  cellTags = signal<string[]>([]);
  tagsLoading = signal(false);

  // ── Add-repo form ───────────────────────────────────────────────────────────
  showAddRepo  = signal(false);
  newRepoName  = signal('');

  // ── Manage environments ─────────────────────────────────────────────────────
  managingEnvs   = signal(false);
  newEnvName     = signal('');
  editingEnvId   = signal<string | null>(null);
  editingEnvName = signal('');

  constructor() {
    effect(() => {
      if (this.editTarget()) {
        setTimeout(() => {
          const inp = this.el.nativeElement.querySelector('.cell-edit-input') as HTMLInputElement | null;
          inp?.focus();
          inp?.select();
        }, 0);
      }
    });
  }

  // ── Cell edit ───────────────────────────────────────────────────────────────

  isEditing(repoId: string, envId: string): boolean {
    const t = this.editTarget();
    return !!t && t.repoId === repoId && t.envId === envId;
  }

  startEdit(repoId: string, envId: string, current: string): void {
    this.editTarget.set({ repoId, envId });
    this.editValue.set(current);
    this.cellTags.set([]);

    const repo = this.repos().find(r => r.id === repoId);
    if (!repo) return;
    const name = repo.repoName;
    if (!name.includes('/')) return;

    if (this.tagsCache.has(name)) {
      this.cellTags.set(this.tagsCache.get(name)!);
      return;
    }
    this.tagsLoading.set(true);
    this.gh.listTags(name).subscribe({
      next: (tags) => {
        const names = tags.map(t => t.name);
        this.tagsCache.set(name, names);
        this.cellTags.set(names);
        this.tagsLoading.set(false);
      },
      error: () => this.tagsLoading.set(false),
    });
  }

  commitEdit(): void {
    const t = this.editTarget();
    if (!t) return;
    const tag = this.editValue().trim();
    if (tag) {
      this.svc.setDeployment(t.repoId, t.envId, tag);
    } else {
      this.svc.clearDeployment(t.repoId, t.envId);
    }
    this.editTarget.set(null);
    this.cellTags.set([]);
  }

  cancelEdit(): void {
    this.editTarget.set(null);
    this.cellTags.set([]);
  }

  onCellKey(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.commitEdit(); }
    if (event.key === 'Escape') { event.preventDefault(); this.cancelEdit(); }
  }

  // ── Repos ───────────────────────────────────────────────────────────────────

  submitAddRepo(): void {
    const name = this.newRepoName().trim();
    if (!name) return;
    this.svc.addRepo(name);
    this.newRepoName.set('');
    this.showAddRepo.set(false);
  }

  removeRepo(id: string): void {
    const repo = this.repos().find(r => r.id === id);
    if (!repo) return;
    this.toasts.confirm(`Remove "${repo.repoName}"?`, 'Remove', () => {
      this.svc.removeRepo(id);
    });
  }

  // ── Environments ────────────────────────────────────────────────────────────

  submitAddEnv(): void {
    const name = this.newEnvName().trim();
    if (!name) return;
    this.svc.addEnv(name);
    this.newEnvName.set('');
  }

  startRenameEnv(id: string, name: string): void {
    this.editingEnvId.set(id);
    this.editingEnvName.set(name);
  }

  commitRenameEnv(): void {
    const id   = this.editingEnvId();
    const name = this.editingEnvName().trim();
    if (id && name) this.svc.renameEnv(id, name);
    this.editingEnvId.set(null);
  }

  cancelRenameEnv(): void {
    this.editingEnvId.set(null);
  }

  onEnvRenameKey(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.commitRenameEnv(); }
    if (event.key === 'Escape') { event.preventDefault(); this.cancelRenameEnv(); }
  }

  removeEnv(id: string): void {
    const env = this.envs().find(e => e.id === id);
    if (!env) return;
    this.toasts.confirm(`Remove environment "${env.name}"? All deployments for this environment will be lost.`, 'Remove', () => {
      this.svc.removeEnv(id);
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  cellId(repoId: string, envId: string): string {
    return `cell-${repoId}-${envId}`;
  }

  updatedTitle(repo: { updatedAt: Record<string, string> }, envId: string): string {
    const d = repo.updatedAt[envId];
    return d ? new Date(d).toLocaleString() : '';
  }
}
