import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { TokenService } from '../../core/services/token.service';
import { GitHubApiService, GhPullRequest } from '../../core/services/github-api.service';
import { GitLabApiService, GlMergeRequest } from '../../core/services/gitlab-api.service';
import { CiRepo } from '../../core/interfaces/ci-provider.interface';
import { CiProviderService } from '../../core/services/ci-provider.service';
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

@Component({
  selector: 'app-pull-requests',
  imports: [FormsModule, TranslateModule, DatePipe],
  templateUrl: './pull-requests.component.html',
  styleUrl: './pull-requests.component.scss',
})
export class PullRequestsComponent implements OnInit {
  private tokens = inject(TokenService);
  private gh = inject(GitHubApiService);
  private gl = inject(GitLabApiService);
  private ci = inject(CiProviderService);

  readonly provider = this.tokens.activeCiProvider;
  readonly isGitHub = computed(() => this.provider() === 'github');

  repoSearch = signal('');
  allRepos = signal<CiRepo[]>([]);
  reposLoading = signal(false);

  selectedRepo = signal<CiRepo | null>(null);
  prs = signal<PullRequest[]>([]);
  prsLoading = signal(false);
  prsError = signal<string | null>(null);
  stateFilter = signal<'open' | 'closed' | 'all'>('open');

  readonly filteredRepos = computed(() => {
    const q = this.repoSearch().toLowerCase();
    return q ? this.allRepos().filter((r) => r.full_name.toLowerCase().includes(q)) : this.allRepos();
  });

  readonly filteredPrs = computed(() => {
    const f = this.stateFilter();
    if (f === 'all') return this.prs();
    return this.prs().filter((pr) => pr.state === f || (f === 'open' && pr.state === 'open'));
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
    this.loadPrs(repo);
  }

  setStateFilter(state: 'open' | 'closed' | 'all'): void {
    this.stateFilter.set(state);
    const repo = this.selectedRepo();
    if (repo) this.loadPrs(repo);
  }

  private loadPrs(repo: CiRepo): void {
    this.prsLoading.set(true);
    this.prsError.set(null);

    if (this.isGitHub()) {
      const ghState = this.stateFilter() as 'open' | 'closed' | 'all';
      this.gh
        .listPullRequests(repo.full_name, ghState)
        .pipe(catchError(() => of([] as GhPullRequest[])))
        .subscribe((data) => {
          this.prs.set(data.map(this.fromGhPr));
          this.prsLoading.set(false);
        });
    } else {
      const glState =
        this.stateFilter() === 'open'
          ? 'opened'
          : this.stateFilter() === 'closed'
            ? 'closed'
            : 'all';
      this.gl
        .listMergeRequests(repo.full_name, glState as 'opened' | 'closed' | 'merged' | 'all')
        .pipe(catchError(() => of([] as GlMergeRequest[])))
        .subscribe((data) => {
          this.prs.set(data.map(this.fromGlMr));
          this.prsLoading.set(false);
        });
    }
  }

  private fromGhPr = (pr: GhPullRequest): PullRequest => ({
    id: pr.id,
    number: pr.number,
    title: pr.title,
    state: pr.merged_at ? 'merged' : (pr.state as 'open' | 'closed'),
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

  private fromGlMr = (mr: GlMergeRequest): PullRequest => ({
    id: mr.id,
    number: mr.iid,
    title: mr.title,
    state: mr.state === 'merged' ? 'merged' : mr.state === 'opened' ? 'open' : 'closed',
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

  prStateClass(state: PullRequest['state'], draft: boolean): string {
    if (draft) return 'draft';
    return state;
  }
}
