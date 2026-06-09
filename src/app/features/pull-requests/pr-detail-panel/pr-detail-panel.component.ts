import {
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { GitHubApiService } from '../../../core/services/github-api.service';
import { GitLabApiService } from '../../../core/services/gitlab-api.service';
import { ToastService } from '../../../shared/services/toast.service';
import { PullRequest } from '../pull-requests.component';

export interface PullRequestDetail {
  body: string | null;
  additions: number | null;
  deletions: number | null;
  changedFiles: number | null;
  commitsCount: number | null;
  comments: number | null;
}

@Component({
  selector: 'app-pr-detail-panel',
  imports: [DatePipe, TranslateModule, FormsModule],
  templateUrl: './pr-detail-panel.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pr-detail-panel.component.scss',
})
export class PrDetailPanelComponent {
  private readonly gh = inject(GitHubApiService);
  private readonly gl = inject(GitLabApiService);
  private readonly toasts = inject(ToastService);

  readonly pr = input.required<PullRequest>();
  readonly repoFullName = input.required<string>();
  readonly isGitHub = input.required<boolean>();
  readonly closed = output<void>();
  readonly prUpdated = output<void>();

  readonly loading = signal(false);
  readonly detail = signal<PullRequestDetail | null>(null);
  readonly actionLoading = signal(false);
  readonly mergeMethod = signal<'merge' | 'squash' | 'rebase'>('merge');

  constructor() {
    effect(() => {
      const pr = this.pr();
      const repo = this.repoFullName();
      const isGitHub = this.isGitHub();
      this.fetchDetail(pr.number, repo, isGitHub);
    });
  }

  private fetchDetail(number: number, repo: string, isGitHub: boolean): void {
    this.loading.set(true);
    this.detail.set(null);

    if (isGitHub) {
      this.gh
        .getPullRequest(repo, number)
        .pipe(catchError(() => of(null)))
        .subscribe((d) => {
          if (d) {
            this.detail.set({
              body: d.body,
              additions: d.additions,
              deletions: d.deletions,
              changedFiles: d.changed_files,
              commitsCount: d.commits,
              comments: d.comments + d.review_comments,
            });
          }
          this.loading.set(false);
        });
    } else {
      this.gl
        .getMergeRequest(repo, number)
        .pipe(catchError(() => of(null)))
        .subscribe((d) => {
          if (d) {
            this.detail.set({
              body: d.description,
              additions: null,
              deletions: null,
              changedFiles: d.changes_count ? Number(d.changes_count) : null,
              commitsCount: null,
              comments: d.user_notes_count,
            });
          }
          this.loading.set(false);
        });
    }
  }

  approve(): void {
    const pr = this.pr();
    const repo = this.repoFullName();
    this.actionLoading.set(true);
    const obs = this.isGitHub()
      ? this.gh.createPrReview(repo, pr.number, 'APPROVE')
      : this.gl.approveMergeRequest(repo, pr.number);
    obs
      .pipe(
        catchError((e: unknown) => {
          const msg =
            (e as { error?: { message?: string } })?.error?.message ?? 'Failed to approve';
          this.toasts.show(msg, 'danger');
          return of(undefined);
        }),
      )
      .subscribe(() => {
        this.actionLoading.set(false);
        this.toasts.show('Approved', 'success');
        this.prUpdated.emit();
      });
  }

  requestChanges(): void {
    const pr = this.pr();
    const repo = this.repoFullName();
    this.actionLoading.set(true);
    const obs = this.isGitHub()
      ? this.gh.createPrReview(repo, pr.number, 'REQUEST_CHANGES')
      : this.gl.unapproveMergeRequest(repo, pr.number);
    obs
      .pipe(
        catchError((e: unknown) => {
          const msg = (e as { error?: { message?: string } })?.error?.message ?? 'Failed';
          this.toasts.show(msg, 'danger');
          return of(undefined);
        }),
      )
      .subscribe(() => {
        this.actionLoading.set(false);
        this.toasts.show('Changes requested', 'success');
        this.prUpdated.emit();
      });
  }

  merge(): void {
    const pr = this.pr();
    const repo = this.repoFullName();
    this.toasts.confirm(`Merge PR #${pr.number}?`, 'Merge', () => {
      this.actionLoading.set(true);
      const obs = this.isGitHub()
        ? this.gh.mergePullRequest(repo, pr.number, this.mergeMethod())
        : this.gl.acceptMergeRequest(repo, pr.number);
      obs
        .pipe(
          catchError((e: unknown) => {
            const msg =
              (e as { error?: { message?: string } })?.error?.message ?? 'Failed to merge';
            this.toasts.show(msg, 'danger');
            return of(undefined);
          }),
        )
        .subscribe(() => {
          this.actionLoading.set(false);
          this.toasts.show(`PR #${pr.number} merged`, 'success');
          this.prUpdated.emit();
        });
    });
  }

  stateClass(): string {
    const pr = this.pr();
    if (pr.draft) return 'draft';
    return pr.state;
  }

  readonly mergeOptions: { value: 'merge' | 'squash' | 'rebase'; labelKey: string }[] = [
    { value: 'merge', labelKey: 'prs.mergeMerge' },
    { value: 'squash', labelKey: 'prs.mergeSquash' },
    { value: 'rebase', labelKey: 'prs.mergeRebase' },
  ];
}
