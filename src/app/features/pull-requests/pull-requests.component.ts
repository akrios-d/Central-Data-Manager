import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { TokenService } from '../../core/services/token.service';
import { GitHubApiService, GhPullRequest } from '../../core/services/github-api.service';
import { GitLabApiService, GlMergeRequest } from '../../core/services/gitlab-api.service';
import { CiRepo } from '../../core/interfaces/ci-provider.interface';
import { CiProviderService } from '../../core/services/ci-provider.service';
import { PinnedReposService } from '../../core/services/pinned-repos.service';
import { PrDetailPanelComponent } from './pr-detail-panel/pr-detail-panel.component';
import { ToastService } from '../../shared/services/toast.service';
import { catchError, of } from 'rxjs';

export interface PullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  headBranch: string;
  baseBranch: string;
  labels: { name: string; color?: string }[];
  reviewers: string[];
}

type PrStateFilter = 'open' | 'closed' | 'all';
type GlPrState = 'opened' | 'closed' | 'merged' | 'all';

const GL_FILTER_STATE: Record<PrStateFilter, GlPrState> = {
  open: 'opened',
  closed: 'closed',
  all: 'all',
};

const GL_MR_STATE: Record<string, PullRequest['state']> = {
  merged: 'merged',
  opened: 'open',
};

const PAGE_SIZE = 10;

@Component({
  selector: 'app-pull-requests',
  imports: [FormsModule, TranslateModule, DatePipe, PrDetailPanelComponent],
  templateUrl: './pull-requests.component.html',
  styleUrl: './pull-requests.component.scss',
})
export class PullRequestsComponent implements OnInit {
  private readonly tokens = inject(TokenService);
  private readonly gh = inject(GitHubApiService);
  private readonly gl = inject(GitLabApiService);
  private readonly ci = inject(CiProviderService);
  private readonly toasts = inject(ToastService);
  readonly pinned = inject(PinnedReposService);

  readonly provider = this.tokens.activeCiProvider;
  readonly isGitHub = computed(() => this.provider() === 'github');

  repoSearch = signal('');
  allRepos = signal<CiRepo[]>([]);
  reposLoading = signal(false);

  selectedRepo = signal<CiRepo | null>(null);
  prs = signal<PullRequest[]>([]);
  prsLoading = signal(false);
  prsError = signal<string | null>(null);
  lastRefreshed = signal<Date | null>(null);
  stateFilter = signal<PrStateFilter>('open');
  authorFilter = signal('');
  labelFilter = signal('');
  selectedPr = signal<PullRequest | null>(null);

  // ── Pagination ─────────────────────────────────────────────────────────────
  page = signal(1);
  readonly pageSize = PAGE_SIZE;

  // ── Create PR form ─────────────────────────────────────────────────────────
  showCreatePr = signal(false);
  createPrTitle = signal('');
  createPrHead = signal('');
  createPrBase = signal('');
  createPrBody = signal('');
  createPrDraft = signal(false);
  createPrLoading = signal(false);
  branches = signal<string[]>([]);
  branchesLoading = signal(false);

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase();
    const all = q
      ? this.allRepos().filter((r) => r.full_name.toLowerCase().includes(q))
      : this.allRepos();
    const pins = this.pinned.pinned();
    return [
      ...all.filter((r) => pins.has(r.full_name)),
      ...all.filter((r) => !pins.has(r.full_name)),
    ];
  });

  readonly filteredPrs = computed(() => {
    const f = this.stateFilter();
    const author = this.authorFilter().toLowerCase().trim();
    const label = this.labelFilter().toLowerCase().trim();

    let list = f === 'all' ? this.prs() : this.prs().filter((pr) => pr.state === f);
    if (author) list = list.filter((pr) => pr.author.toLowerCase().includes(author));
    if (label)
      list = list.filter((pr) => pr.labels.some((l) => l.name.toLowerCase().includes(label)));
    // Always sort newest first
    return [...list].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredPrs().length / PAGE_SIZE)),
  );

  readonly paginatedPrs = computed(() => {
    const p = this.page();
    return this.filteredPrs().slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE);
  });

  ngOnInit(): void {
    this.loadRepos();
  }

  private loadRepos(): void {
    this.reposLoading.set(true);
    this.ci
      .listRepos()
      .pipe(catchError(() => of([] as CiRepo[])))
      .subscribe((repos) => {
        this.allRepos.set(repos);
        this.reposLoading.set(false);
      });
  }

  selectRepo(repo: CiRepo): void {
    this.selectedRepo.set(repo);
    this.prs.set([]);
    this.prsError.set(null);
    this.authorFilter.set('');
    this.labelFilter.set('');
    this.selectedPr.set(null);
    this.page.set(1);
    this.loadPrs(repo);
    this.loadBranches(repo);
  }

  private loadBranches(repo: CiRepo): void {
    this.branchesLoading.set(true);
    this.ci.listBranches(repo.full_name, repo.provider).subscribe({
      next: (bs) => {
        this.branches.set(bs.map((b) => b.name));
        this.branchesLoading.set(false);
        // Pre-fill base with default branch
        if (repo.default_branch) this.createPrBase.set(repo.default_branch);
      },
      error: () => this.branchesLoading.set(false),
    });
  }

  openPr(pr: PullRequest): void {
    this.selectedPr.set(pr);
  }

  togglePin(event: MouseEvent, fullName: string): void {
    event.stopPropagation();
    this.pinned.toggle(fullName);
  }

  setStateFilter(state: PrStateFilter): void {
    this.stateFilter.set(state);
    this.page.set(1);
    const repo = this.selectedRepo();
    if (repo) this.loadPrs(repo);
  }

  setAuthorFilter(val: string): void {
    this.authorFilter.set(val);
    this.page.set(1);
  }

  setLabelFilter(val: string): void {
    this.labelFilter.set(val);
    this.page.set(1);
  }

  nextPage(): void {
    if (this.page() < this.totalPages()) this.page.update((p) => p + 1);
  }

  prevPage(): void {
    if (this.page() > 1) this.page.update((p) => p - 1);
  }

  reload(): void {
    const repo = this.selectedRepo();
    if (repo) this.loadPrs(repo);
  }

  onPrUpdated(): void {
    this.selectedPr.set(null);
    this.reload();
  }

  // ── Create PR ─────────────────────────────────────────────────────────────
  openCreatePr(): void {
    this.showCreatePr.set(true);
    this.createPrTitle.set('');
    this.createPrBody.set('');
    this.createPrHead.set('');
    this.createPrDraft.set(false);
  }

  cancelCreatePr(): void {
    this.showCreatePr.set(false);
  }

  submitCreatePr(): void {
    const repo = this.selectedRepo();
    const title = this.createPrTitle().trim();
    const head = this.createPrHead().trim();
    const base = this.createPrBase().trim();
    if (!repo || !title || !head || !base) {
      this.toasts.show('Title, head and base branch are required', 'danger');
      return;
    }
    this.createPrLoading.set(true);
    if (this.isGitHub()) {
      this.gh
        .createPullRequest(
          repo.full_name,
          title,
          head,
          base,
          this.createPrBody(),
          this.createPrDraft(),
        )
        .subscribe({
          next: () => {
            this.toasts.show('Pull request created', 'success');
            this.showCreatePr.set(false);
            this.createPrLoading.set(false);
            this.reload();
          },
          error: (e: unknown) => {
            const msg =
              (e as { error?: { message?: string } })?.error?.message ?? 'Failed to create PR';
            this.toasts.show(msg, 'danger');
            this.createPrLoading.set(false);
          },
        });
    } else {
      this.gl.createMergeRequest(repo.full_name, title, head, base, this.createPrBody()).subscribe({
        next: () => {
          this.toasts.show('Merge request created', 'success');
          this.showCreatePr.set(false);
          this.createPrLoading.set(false);
          this.reload();
        },
        error: (e: unknown) => {
          const msg =
            (e as { error?: { message?: string } })?.error?.message ?? 'Failed to create MR';
          this.toasts.show(msg, 'danger');
          this.createPrLoading.set(false);
        },
      });
    }
  }

  private loadPrs(repo: CiRepo): void {
    this.prsLoading.set(true);
    this.prsError.set(null);

    if (this.isGitHub()) {
      this.gh
        .listPullRequests(repo.full_name, this.stateFilter())
        .pipe(catchError(() => of([] as GhPullRequest[])))
        .subscribe((data) => {
          this.prs.set(data.map(this.fromGhPr));
          this.lastRefreshed.set(new Date());
          this.prsLoading.set(false);
        });
    } else {
      this.gl
        .listMergeRequests(repo.full_name, GL_FILTER_STATE[this.stateFilter()])
        .pipe(catchError(() => of([] as GlMergeRequest[])))
        .subscribe((data) => {
          this.prs.set(data.map(this.fromGlMr));
          this.lastRefreshed.set(new Date());
          this.prsLoading.set(false);
        });
    }
  }

  private readonly fromGhPr = (pr: GhPullRequest): PullRequest => ({
    id: pr.id,
    number: pr.number,
    title: pr.title,
    state: this.ghPrState(pr),
    draft: pr.draft,
    author: pr.user.login,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
    url: pr.html_url,
    headBranch: pr.head.ref,
    baseBranch: pr.base.ref,
    labels: pr.labels.map((l) => ({ name: l.name, color: l.color })),
    reviewers: pr.requested_reviewers.map((r) => r.login),
  });

  private readonly fromGlMr = (mr: GlMergeRequest): PullRequest => ({
    id: mr.id,
    number: mr.iid,
    title: mr.title,
    state: GL_MR_STATE[mr.state] ?? 'closed',
    draft: mr.draft,
    author: mr.author.username,
    createdAt: mr.created_at,
    updatedAt: mr.updated_at,
    url: mr.web_url,
    headBranch: mr.source_branch,
    baseBranch: mr.target_branch,
    labels: mr.labels.map((l) => ({ name: l })),
    reviewers: mr.reviewers.map((r) => r.username),
  });

  private ghPrState(pr: GhPullRequest): PullRequest['state'] {
    if (pr.merged_at) return 'merged';
    if (pr.state === 'open') return 'open';
    return 'closed';
  }

  prStateClass(state: PullRequest['state'], draft: boolean): string {
    if (draft) return 'draft';
    return state;
  }
}
