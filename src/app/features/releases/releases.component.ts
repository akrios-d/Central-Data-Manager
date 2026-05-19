import { Component, ElementRef, inject, signal, effect, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ReleaseService } from '../../core/services/release.service';
import { GitHubApiService, GhRepo, GhComparison, GhCommitInfo } from '../../core/services/github-api.service';
import { ToastService } from '../../shared/services/toast.service';
import { firstValueFrom } from 'rxjs';

const CONV_TYPES: Record<string, { label: string; icon: string }> = {
  feat:     { label: 'Features',       icon: '🚀' },
  fix:      { label: 'Bug Fixes',      icon: '🐛' },
  perf:     { label: 'Performance',    icon: '⚡' },
  refactor: { label: 'Refactoring',    icon: '♻️' },
  docs:     { label: 'Documentation',  icon: '📚' },
  test:     { label: 'Tests',          icon: '🧪' },
  ci:       { label: 'CI/CD',          icon: '🔄' },
  build:    { label: 'Build',          icon: '🏗️' },
  chore:    { label: 'Chores',         icon: '🔧' },
  style:    { label: 'Style',          icon: '🎨' },
  other:    { label: 'Other Changes',  icon: '📦' },
};

interface ChangelogSection { type: string; icon: string; label: string; items: string[]; }

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

  // ── Ref suggestions (tags + branches) ──────────────────────────────────────
  private tagsCache     = new Map<string, string[]>();
  private branchesCache = new Map<string, string[]>();
  cellTags     = signal<string[]>([]);
  cellBranches = signal<string[]>([]);
  refsLoading  = signal(false);
  showRefDrop  = signal(false);

  filteredCellTags = computed(() => {
    const q = this.editValue().toLowerCase();
    return q ? this.cellTags().filter(t => t.toLowerCase().includes(q)) : this.cellTags();
  });

  filteredCellBranches = computed(() => {
    const q = this.editValue().toLowerCase();
    return q ? this.cellBranches().filter(b => b.toLowerCase().includes(q)) : this.cellBranches();
  });

  hasRefSuggestions = computed(() =>
    this.filteredCellTags().length > 0 || this.filteredCellBranches().length > 0
  );

  // ── Add-repo form ───────────────────────────────────────────────────────────
  showAddRepo     = signal(false);
  ghRepos         = signal<GhRepo[]>([]);
  ghReposLoading  = signal(false);
  repoSearch      = signal('');
  selectedGhRepo  = signal<GhRepo | null>(null);

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    const list = this.ghRepos();
    return q ? list.filter(r => r.full_name.toLowerCase().includes(q)) : list;
  });

  readonly showRepoDropdown = computed(() =>
    this.repoSearch().trim().length > 0 && !this.selectedGhRepo() && this.filteredRepos().length > 0
  );

  readonly alreadyAdded = computed(() =>
    new Set(this.repos().map(r => r.repoName))
  );

  // ── Compare panel ──────────────────────────────────────────────────────────
  compareRepoId    = signal<string | null>(null);
  compareBaseEnvId = signal('');
  compareHeadEnvId = signal('');
  comparison       = signal<GhComparison | null>(null);
  compLoading      = signal(false);
  compError        = signal('');
  showChangelog    = signal(false);

  changelog = computed((): ChangelogSection[] => {
    const commits = this.comparison()?.commits ?? [];
    if (!commits.length) return [];
    const map = new Map<string, string[]>();
    for (const c of commits) {
      const type = this.parseConvType(c.commit.message);
      if (!map.has(type)) map.set(type, []);
      map.get(type)!.push(this.parseConvDesc(c.commit.message));
    }
    const order = Object.keys(CONV_TYPES);
    return [...map.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([type, items]) => ({ type, items, ...CONV_TYPES[type] ?? CONV_TYPES['other'] }));
  });

  changelogMarkdown = computed((): string => {
    const comp = this.comparison();
    if (!comp) return '';
    const base = this.repos().find(r => r.id === this.compareRepoId())?.deployments[this.compareBaseEnvId()] ?? '';
    const head = this.repos().find(r => r.id === this.compareRepoId())?.deployments[this.compareHeadEnvId()] ?? '';
    const sections = this.changelog().map(s =>
      `### ${s.icon} ${s.label}\n${s.items.map(i => `- ${i}`).join('\n')}`
    ).join('\n\n');
    return `## What's Changed\n\n> \`${base}\` → \`${head}\`\n\n${sections}`;
  });

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
    this.cellBranches.set([]);
    this.showRefDrop.set(true);

    const repo = this.repos().find(r => r.id === repoId);
    if (!repo?.repoName.includes('/')) return;
    const name = repo.repoName;

    const tagsReady    = this.tagsCache.has(name);
    const branchesReady = this.branchesCache.has(name);

    if (tagsReady)    this.cellTags.set(this.tagsCache.get(name)!);
    if (branchesReady) this.cellBranches.set(this.branchesCache.get(name)!);
    if (tagsReady && branchesReady) return;

    this.refsLoading.set(true);
    const pending = { tags: tagsReady, branches: branchesReady };
    const done = () => { if (pending.tags && pending.branches) this.refsLoading.set(false); };

    if (!tagsReady) {
      this.gh.listTags(name).subscribe({
        next: t => { const n = t.map(x => x.name); this.tagsCache.set(name, n); this.cellTags.set(n); pending.tags = true; done(); },
        error: () => { pending.tags = true; done(); },
      });
    }
    if (!branchesReady) {
      this.gh.listBranches(name).subscribe({
        next: b => { const n = b.map(x => x.name); this.branchesCache.set(name, n); this.cellBranches.set(n); pending.branches = true; done(); },
        error: () => { pending.branches = true; done(); },
      });
    }
  }

  selectRef(val: string): void {
    this.editValue.set(val);
    this.commitEdit();
  }

  commitEdit(): void {
    const t = this.editTarget();
    if (!t) return;
    const val = this.editValue().trim();
    if (val) {
      this.svc.setDeployment(t.repoId, t.envId, val);
    } else {
      this.svc.clearDeployment(t.repoId, t.envId);
    }
    this.editTarget.set(null);
    this.showRefDrop.set(false);
  }

  cancelEdit(): void {
    this.editTarget.set(null);
    this.showRefDrop.set(false);
  }

  onCellKey(event: KeyboardEvent): void {
    if (event.key === 'Enter')  { event.preventDefault(); this.commitEdit(); }
    if (event.key === 'Escape') { event.preventDefault(); this.cancelEdit(); }
  }

  // ── Repos ───────────────────────────────────────────────────────────────────

  openAddRepo(): void {
    this.showAddRepo.set(true);
    if (!this.ghRepos().length) {
      this.ghReposLoading.set(true);
      this.gh.listRepos().subscribe({
        next: (r)  => { this.ghRepos.set(r); this.ghReposLoading.set(false); },
        error: ()  => this.ghReposLoading.set(false),
      });
    }
  }

  onRepoSearchChange(val: string): void {
    this.repoSearch.set(val);
    if (this.selectedGhRepo() && val !== this.selectedGhRepo()!.full_name) {
      this.selectedGhRepo.set(null);
    }
  }

  selectGhRepo(repo: GhRepo): void {
    this.selectedGhRepo.set(repo);
    this.repoSearch.set(repo.full_name);
  }

  submitAddRepo(): void {
    const repo = this.selectedGhRepo();
    if (!repo) return;
    this.svc.addRepo(repo.full_name);
    this.cancelAddRepo();
  }

  cancelAddRepo(): void {
    this.showAddRepo.set(false);
    this.repoSearch.set('');
    this.selectedGhRepo.set(null);
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

  // ── Compare ──────────────────────────────────────────────────────────────────

  // ── Changelog helpers ─────────────────────────────────────────────────────
  private parseConvType(msg: string): string {
    const m = msg.match(/^(\w+)(?:\(.*?\))?!?:/);
    const t = m?.[1]?.toLowerCase() ?? 'other';
    return CONV_TYPES[t] ? t : 'other';
  }

  private parseConvDesc(msg: string): string {
    return msg.replace(/^\w+(?:\(.*?\))?!?:\s*/, '').split('\n')[0].trim();
  }

  copyChangelog(): void {
    navigator.clipboard.writeText(this.changelogMarkdown()).catch(() => {});
  }

  // ── Compare ──────────────────────────────────────────────────────────────────

  envsWithTag(repoId: string): { envId: string; envName: string; tag: string }[] {
    const repo = this.repos().find(r => r.id === repoId);
    if (!repo) return [];
    return this.envs()
      .filter(e => repo.deployments[e.id])
      .map(e => ({ envId: e.id, envName: e.name, tag: repo.deployments[e.id] }));
  }

  canCompare(repoId: string): boolean {
    return this.envsWithTag(repoId).length >= 2;
  }

  toggleCompare(repoId: string): void {
    if (this.compareRepoId() === repoId) {
      this.compareRepoId.set(null);
      this.comparison.set(null);
      return;
    }
    this.comparison.set(null);
    this.compError.set('');
    this.showChangelog.set(false);
    this.compareRepoId.set(repoId);

    const tagged = this.envsWithTag(repoId);
    if (tagged.length >= 2) {
      this.compareBaseEnvId.set(tagged[tagged.length - 1].envId); // rightmost env (dev)
      this.compareHeadEnvId.set(tagged[tagged.length - 2].envId); // next to the left
      this.runCompare();
    }
  }

  onBaseEnvChange(envId: string): void {
    this.compareBaseEnvId.set(envId);
    this.showChangelog.set(false);
    this.runCompare();
  }

  onHeadEnvChange(envId: string): void {
    this.compareHeadEnvId.set(envId);
    this.showChangelog.set(false);
    this.runCompare();
  }

  async runCompare(): Promise<void> {
    const repoId = this.compareRepoId();
    if (!repoId) return;
    const repo = this.repos().find(r => r.id === repoId);
    if (!repo) return;
    const base = repo.deployments[this.compareBaseEnvId()];
    const head = repo.deployments[this.compareHeadEnvId()];
    if (!base || !head) return;

    this.comparison.set(null);
    this.compError.set('');
    await Promise.resolve(); // flush render so the clear is visible before loading starts
    this.compLoading.set(true);
    try {
      const result = await firstValueFrom(this.gh.compareRefs(repo.repoName, base, head));
      this.comparison.set(result);
    } catch (e: any) {
      this.compError.set(e?.error?.message ?? 'Error loading comparison');
    } finally {
      this.compLoading.set(false);
    }
  }

  isBranch(val: string): boolean {
    // Tags look like: v1.0.0, 1.2.3, 20240101, release-1.0
    // Branches: main, develop, feature/x, hotfix/y, etc.
    return !/^v?\d[\d.\-_]*$/.test(val) && !(/^release[-\/]\d/i.test(val));
  }

  shortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  firstCommitLine(msg: string): string {
    return msg.split('\n')[0];
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
