import { Component, ElementRef, inject, signal, effect, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { ReleaseService } from '../../core/services/release.service';
import { RepoEntry } from '../../core/models/release.model';
import { CiProviderService } from '../../core/services/ci-provider.service';
import { CiRepo, CiComparison } from '../../core/interfaces/ci-provider.interface';
import { ToastService } from '../../shared/services/toast.service';
import { firstValueFrom } from 'rxjs';

const CONV_TYPES: Record<string, { label: string; icon: string }> = {
  feat: { label: 'Features', icon: '🚀' },
  fix: { label: 'Bug Fixes', icon: '🐛' },
  perf: { label: 'Performance', icon: '⚡' },
  refactor: { label: 'Refactoring', icon: '♻️' },
  docs: { label: 'Documentation', icon: '📚' },
  test: { label: 'Tests', icon: '🧪' },
  ci: { label: 'CI/CD', icon: '🔄' },
  build: { label: 'Build', icon: '🏗️' },
  chore: { label: 'Chores', icon: '🔧' },
  style: { label: 'Style', icon: '🎨' },
  other: { label: 'Other Changes', icon: '📦' },
};

interface ChangelogSection {
  type: string;
  icon: string;
  label: string;
  items: string[];
}
interface EditTarget {
  repoId: string;
  envId: string;
}
interface EnvDeployment {
  envId: string;
  envName: string;
  tag: string;
}

@Component({
  selector: 'app-releases',
  standalone: true,
  imports: [FormsModule, TranslateModule],
  templateUrl: './releases.component.html',
  styleUrl: './releases.component.scss',
})
export class ReleasesComponent {
  private readonly svc = inject(ReleaseService);
  private readonly ci = inject(CiProviderService);
  private readonly toasts = inject(ToastService);
  private readonly el = inject(ElementRef);

  readonly envs = this.svc.envs;
  readonly repos = this.svc.repos;
  repoTableSearch = signal('');
  readonly filteredRepos2 = computed(() => {
    const q = this.repoTableSearch().toLowerCase().trim();
    return q
      ? this.repos().filter(
          (r) =>
            r.repoName.toLowerCase().includes(q) ||
            Object.values(r.deployments).some((v) => v.toLowerCase().includes(q)),
        )
      : this.repos();
  });

  // ── Cell ref popup ──────────────────────────────────────────────────────────
  editTarget = signal<EditTarget | null>(null);
  currentRef = signal('');
  popupSearch = signal('');
  showRefPopup = signal(false);
  refMode = signal<'tags' | 'branches' | 'hash'>('tags');
  commitHash = signal('');

  private readonly tagsCache = new Map<string, string[]>();
  private readonly branchesCache = new Map<string, string[]>();
  cellTags = signal<string[]>([]);
  cellBranches = signal<string[]>([]);
  refsLoading = signal(false);
  filteredCellTags = computed(() => {
    const q = this.popupSearch().toLowerCase();
    return q ? this.cellTags().filter((t) => t.toLowerCase().includes(q)) : this.cellTags();
  });

  filteredCellBranches = computed(() => {
    const q = this.popupSearch().toLowerCase();
    return q ? this.cellBranches().filter((b) => b.toLowerCase().includes(q)) : this.cellBranches();
  });

  readonly POPUP_LIMIT = 5;
  displayedTags = computed(() => this.filteredCellTags().slice(0, this.POPUP_LIMIT));
  displayedBranches = computed(() => this.filteredCellBranches().slice(0, this.POPUP_LIMIT));

  // ── Add-repo form ───────────────────────────────────────────────────────────
  showAddRepo = signal(false);
  ciRepos = signal<CiRepo[]>([]);
  ciReposLoading = signal(false);
  repoSearch = signal('');
  selectedCiRepo = signal<CiRepo | null>(null);

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase().trim();
    const list = this.ciRepos();
    return q ? list.filter((r) => r.full_name.toLowerCase().includes(q)) : list;
  });

  readonly showRepoDropdown = computed(
    () =>
      this.repoSearch().trim().length > 0 &&
      !this.selectedCiRepo() &&
      this.filteredRepos().length > 0,
  );

  readonly alreadyAdded = computed(() => new Set(this.repos().map((r) => r.repoName)));

  // ── Compare panel ──────────────────────────────────────────────────────────
  compareRepoId = signal<string | null>(null);
  compareBaseEnvId = signal('');
  compareHeadEnvId = signal('');
  comparison = signal<CiComparison | null>(null);
  compLoading = signal(false);
  compError = signal('');
  showChangelog = signal(false);

  changelog = computed((): ChangelogSection[] => {
    const commits = this.comparison()?.commits ?? [];
    if (!commits.length) return [];
    const map = new Map<string, string[]>();
    for (const c of commits) {
      const type = this.parseConvType(c.message);
      let typeItems = map.get(type);
      if (!typeItems) {
        typeItems = [];
        map.set(type, typeItems);
      }
      typeItems.push(this.parseConvDesc(c.message));
    }
    const order = Object.keys(CONV_TYPES);
    return [...map.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([type, items]) => ({ type, items, ...(CONV_TYPES[type] ?? CONV_TYPES['other']) }));
  });

  changelogMarkdown = computed((): string => {
    const comp = this.comparison();
    if (!comp) return '';
    const base =
      this.repos().find((r) => r.id === this.compareRepoId())?.deployments[
        this.compareBaseEnvId()
      ] ?? '';
    const head =
      this.repos().find((r) => r.id === this.compareRepoId())?.deployments[
        this.compareHeadEnvId()
      ] ?? '';
    const sections = this.changelog()
      .map((s) => `### ${s.icon} ${s.label}\n${s.items.map((i) => '- ' + i).join('\n')}`)
      .join('\n\n');
    return `## What's Changed\n\n> \`${base}\` → \`${head}\`\n\n${sections}`;
  });

  // ── Manage environments ─────────────────────────────────────────────────────
  activeRelTab = signal<'control' | 'manage' | 'envs'>('control');
  managingEnvs = signal(false);
  newEnvName = signal('');
  editingEnvId = signal<string | null>(null);
  editingEnvName = signal('');

  constructor() {
    effect(() => {
      if (this.showRefPopup()) {
        setTimeout(() => {
          const inp = this.el.nativeElement.querySelector(
            '.ref-popup-input',
          ) as HTMLInputElement | null;
          inp?.focus();
          inp?.select();
        }, 0);
      }
    });
  }

  // ── Cell ref popup ───────────────────────────────────────────────────────────

  startEdit(repoId: string, envId: string, currentVal = ''): void {
    this.editTarget.set({ repoId, envId });
    this.currentRef.set(currentVal);
    this.popupSearch.set('');
    this.commitHash.set('');
    this.cellTags.set([]);
    this.cellBranches.set([]);
    this.refMode.set('tags');
    this.showRefPopup.set(true);

    const repo = this.repos().find((r) => r.id === repoId);
    if (!repo?.repoName.includes('/')) return;
    const name = repo.repoName;
    const provider = repo.provider ?? 'github';

    const tagsReady = this.tagsCache.has(name);
    const branchesReady = this.branchesCache.has(name);

    if (tagsReady) this.cellTags.set(this.tagsCache.get(name) ?? []);
    if (branchesReady) this.cellBranches.set(this.branchesCache.get(name) ?? []);
    if (tagsReady && branchesReady) return;

    this.refsLoading.set(true);
    const pending = { tags: tagsReady, branches: branchesReady };
    const done = () => {
      if (pending.tags && pending.branches) this.refsLoading.set(false);
    };

    if (!tagsReady) {
      this.ci.listTags(name, provider).subscribe({
        next: (t) => {
          const n = t.map((x) => x.name);
          this.tagsCache.set(name, n);
          this.cellTags.set(n);
          pending.tags = true;
          done();
        },
        error: () => {
          pending.tags = true;
          done();
        },
      });
    }
    if (!branchesReady) {
      this.ci.listBranches(name, provider).subscribe({
        next: (b) => {
          const n = b.map((x) => x.name);
          this.branchesCache.set(name, n);
          this.cellBranches.set(n);
          pending.branches = true;
          done();
        },
        error: () => {
          pending.branches = true;
          done();
        },
      });
    }
  }

  selectRef(val: string): void {
    const t = this.editTarget();
    if (t) this.svc.setDeployment(t.repoId, t.envId, val);
    this.closePopup();
  }

  commitManual(): void {
    const val = this.popupSearch().trim();
    const t = this.editTarget();
    if (val && t) this.svc.setDeployment(t.repoId, t.envId, val);
    this.closePopup();
  }

  setRefMode(mode: 'tags' | 'branches' | 'hash'): void {
    this.refMode.set(mode);
  }

  closePopup(): void {
    this.showRefPopup.set(false);
    this.editTarget.set(null);
  }

  // ── Repos ───────────────────────────────────────────────────────────────────

  openAddRepo(): void {
    this.showAddRepo.set(true);
    if (!this.ciRepos().length) {
      this.ciReposLoading.set(true);
      this.ci.listRepos().subscribe({
        next: (r) => {
          this.ciRepos.set(r);
          this.ciReposLoading.set(false);
        },
        error: () => this.ciReposLoading.set(false),
      });
    }
  }

  onRepoSearchChange(val: string): void {
    this.repoSearch.set(val);
    if (this.selectedCiRepo() && val !== this.selectedCiRepo()?.full_name) {
      this.selectedCiRepo.set(null);
    }
  }

  selectCiRepo(repo: CiRepo): void {
    this.selectedCiRepo.set(repo);
    this.repoSearch.set(repo.full_name);
  }

  submitAddRepo(): void {
    const repo = this.selectedCiRepo();
    if (!repo) return;
    this.svc.addRepo(repo.full_name, repo.provider);
    this.cancelAddRepo();
  }

  cancelAddRepo(): void {
    this.showAddRepo.set(false);
    this.repoSearch.set('');
    this.selectedCiRepo.set(null);
  }

  removeRepo(id: string): void {
    const repo = this.repos().find((r) => r.id === id);
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
    const id = this.editingEnvId();
    const name = this.editingEnvName().trim();
    if (id && name) this.svc.renameEnv(id, name);
    this.editingEnvId.set(null);
  }

  cancelRenameEnv(): void {
    this.editingEnvId.set(null);
  }

  onEnvRenameKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commitRenameEnv();
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancelRenameEnv();
    }
  }

  removeEnv(id: string): void {
    const env = this.envs().find((e) => e.id === id);
    if (!env) return;
    this.toasts.confirm(
      `Remove environment "${env.name}"? All deployments for this environment will be lost.`,
      'Remove',
      () => {
        this.svc.removeEnv(id);
      },
    );
  }

  // ── Compare ──────────────────────────────────────────────────────────────────

  private parseConvType(msg: string): string {
    const m = /^(\w+)(?:\(.*?\))?!?:/.exec(msg);
    const t = m?.[1]?.toLowerCase() ?? 'other';
    return CONV_TYPES[t] ? t : 'other';
  }

  private parseConvDesc(msg: string): string {
    return msg
      .replace(/^\w+(?:\(.*?\))?!?:\s*/, '')
      .split('\n')[0]
      .trim();
  }

  copyChangelog(): void {
    navigator.clipboard.writeText(this.changelogMarkdown()).catch(() => {});
  }

  envsWithTag(repoId: string): EnvDeployment[] {
    const repo = this.repos().find((r) => r.id === repoId);
    if (!repo) return [];
    return this.envs()
      .filter((e) => repo.deployments[e.id])
      .map((e) => ({ envId: e.id, envName: e.name, tag: repo.deployments[e.id] }));
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
      this.compareBaseEnvId.set(tagged.at(-1)?.envId ?? '');
      this.compareHeadEnvId.set(tagged.at(-2)?.envId ?? '');
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
    const repo = this.repos().find((r) => r.id === repoId);
    if (!repo) return;
    const base = repo.deployments[this.compareBaseEnvId()];
    const head = repo.deployments[this.compareHeadEnvId()];
    const provider = repo.provider ?? 'github';
    if (!base || !head) return;

    this.comparison.set(null);
    this.compError.set('');
    await Promise.resolve();
    this.compLoading.set(true);
    try {
      const result = await firstValueFrom(this.ci.compareRefs(repo.repoName, base, head, provider));
      this.comparison.set(result);
    } catch (e: unknown) {
      this.compError.set(
        (e as { error?: { message?: string } })?.error?.message ?? 'Error loading comparison',
      );
    } finally {
      this.compLoading.set(false);
    }
  }

  isBranch(val: string): boolean {
    return !/^v?\d[\d.\-_]*$/.test(val) && !/^release[-/]\d/i.test(val);
  }

  shortDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  firstCommitLine(msg: string): string {
    return msg.split('\n')[0];
  }

  cellId(repoId: string, envId: string): string {
    return `cell-${repoId}-${envId}`;
  }

  updatedTitle(repo: RepoEntry, envId: string): string {
    const d = repo.updatedAt[envId];
    return d ? new Date(d).toLocaleString() : '';
  }

  providerBadge(provider: string | undefined): string {
    return provider === 'gitlab' ? 'GL' : 'GH';
  }
}
