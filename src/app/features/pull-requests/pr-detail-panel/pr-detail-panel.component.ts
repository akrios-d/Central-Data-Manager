import { Component, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { catchError, of } from 'rxjs';
import { GitHubApiService } from '../../../core/services/github-api.service';
import { GitLabApiService } from '../../../core/services/gitlab-api.service';
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
  imports: [DatePipe, TranslateModule],
  templateUrl: './pr-detail-panel.component.html',
  styleUrl: './pr-detail-panel.component.scss',
})
export class PrDetailPanelComponent {
  private readonly gh = inject(GitHubApiService);
  private readonly gl = inject(GitLabApiService);

  readonly pr = input.required<PullRequest>();
  readonly repoFullName = input.required<string>();
  readonly isGitHub = input.required<boolean>();
  readonly closed = output<void>();

  readonly loading = signal(false);
  readonly detail = signal<PullRequestDetail | null>(null);

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

  stateClass(): string {
    const pr = this.pr();
    if (pr.draft) return 'draft';
    return pr.state;
  }
}
