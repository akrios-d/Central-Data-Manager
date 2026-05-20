# CDM — Claude Spec File

This file gives Claude Code full context on Central Data Manager so it can be productive from the first message of any session. Read this before touching any file.

---

## What this project is

**Central Data Manager (CDM)** is a 100 % client-side Angular 21 dashboard. There is no backend, no database, no Auth.js, no server. All API calls go directly from the browser to the provider APIs. All state is stored in the browser (sessionStorage by default, localStorage if the user opts in).

**Owner:** Felipe "Akrios" Oliveira — gdevffelipe@gmail.com

**Never suggest server-side solutions.** If a feature seems to need a backend, find a client-side alternative or explicitly tell the user it cannot be done without a backend and ask how they want to proceed.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Angular 21, standalone components, no NgModules |
| State | Angular Signals (`signal`, `computed`, `effect`) — no RxJS state, RxJS only for HTTP |
| HTTP | `HttpClient` with `withFetch()` |
| i18n | `@ngx-translate/core`, files in `public/i18n/en.json` and `public/i18n/pt.json` |
| Styling | Global SCSS variables in `src/styles.scss`, per-component SCSS |
| Build | Angular CLI 21, `ng build --configuration=production` |
| Container | Docker + `nginx:alpine`, config in `nginx.conf` |
| Formatting | Prettier — always run after HTML or TS edits |
| Linting | ESLint + SonarLint IDE rules |

---

## Routing (`src/app/app.routes.ts`)

| Path | Component | Guard |
|---|---|---|
| `/` | redirect → `/onboarding` or `/dashboard` | `onboardingGuard` |
| `/onboarding` | `OnboardingComponent` | none |
| `/dashboard` | `DashboardComponent` | `tokenGuard` |
| `/github-actions` | `GithubActionsComponent` | `tokenGuard` |
| `/chain-builder` | `ChainBuilderComponent` | `tokenGuard` |
| `/chain-orchestrator` | `ChainOrchestratorComponent` | `tokenGuard` |
| `/devops-boards` | `DevopsBoardsComponent` | `tokenGuard` |
| `/blockers` | `BlockersComponent` | `tokenGuard` |
| `/releases` | `ReleasesComponent` | `tokenGuard` |
| `/settings` | `SettingsComponent` | none |

`tokenGuard` — inline function in `app.routes.ts`, redirects to `/onboarding` if no token is configured for any provider.

---

## Core services

### `TokenService` (`src/app/core/services/token.service.ts`)
Single source of truth for all tokens and provider selection. Uses Signals. Reads/writes to sessionStorage (or localStorage when `persist()` is true).

Key signals: `hasGitHub`, `hasDevOps`, `hasGitLab`, `hasJira`, `activeCiProvider`, `activeBoardsProvider`, `persist`, `githubOwner`, `devopsOrg`, `devopsProject`, `devopsTeam`, `gitlabBaseUrl`, `jiraEmail`, `jiraBaseUrl`, `jiraProject`.

Storage keys: `cdm:github`, `cdm:github:owner`, `cdm:devops`, `cdm:devops:org`, `cdm:devops:project`, `cdm:devops:team`, `cdm:gitlab`, `cdm:gitlab:url`, `cdm:jira`, `cdm:jira:email`, `cdm:jira:url`, `cdm:jira:project`, `cdm:persist`, `cdm:ci:provider`, `cdm:boards:provider`.

### `AppSettingsService` (`src/app/core/services/app-settings.service.ts`)
Polling and timeout settings. Signals: `pollIntervalSec` (default 10), `maxPolls` (default 60), `sessionTimeoutHours` (default 8). Storage keys: `cdm:poll_interval`, `cdm:max_polls`, `cdm:session_timeout_h`.

### `AuditLogService` (`src/app/core/services/audit-log.service.ts`)
Persistent audit trail in `localStorage` key `cdm:audit_log`, max 500 entries (FIFO). Signal: `entries`. Methods: `log(action, detail?)`, `clear()`. Called from: SettingsComponent (token events), ChainExecutorService, OrchestratorExecutorService, SessionTimeoutService.

### `SessionTimeoutService` (`src/app/core/services/session-timeout.service.ts`)
Inactivity timeout — only active in session-only mode (`!tokens.persist()`). Tracks activity via `click`, `keydown`, `mousemove`, `touchstart` events, throttled writes to `sessionStorage` key `cdm:last_activity` (every 30 s). Polls every 60 s. When expired: calls `tokens.clearAll()`, sets `expired` signal to `true`. Signal: `expired`. Methods: `init()` (called in `App` constructor), `dismiss()`.

### `GitHubApiService` (`src/app/core/services/github-api.service.ts`)
Direct calls to `https://api.github.com`. Auth: `Authorization: Bearer <token>`. Methods: `getAuthenticatedUser`, `listRepos`, `listOrgs`, `listWorkflows`, `listRuns`, `triggerWorkflow`, `rerunWorkflow`, `cancelRun`, `listTags`, `deleteRepoCaches`, `getRepo`, `compareCommits`.

### `GitLabApiService` (`src/app/core/services/gitlab-api.service.ts`)
Direct calls to configured base URL (default `https://gitlab.com`). Auth: `PRIVATE-TOKEN` header. Methods: `listProjects`, `listPipelines`, `triggerPipeline`, `getPipeline`, `retryPipeline`, `cancelPipeline`, `listTags`.

### `DevOpsApiService` (`src/app/core/services/devops-api.service.ts`)
Direct calls to `https://dev.azure.com` and `https://vsrm.dev.azure.com`. Auth: Basic with base64 `:PAT`. Methods: `listProjects`, `listTeams`, `getWorkItems`, `updateWorkItemState`, `getIterations`, `getIterationWorkItems`, `listBoards`.

### `JiraApiService` (`src/app/core/services/jira-api.service.ts`)
Direct calls to configured Atlassian base URL. Auth: Basic with base64 `email:token`. Methods: `getMyself`, `listProjects`, `getBoard`, `getSprints`, `getSprintIssues`, `getIssueTransitions`, `transitionIssue`.

### `CiProviderService` (`src/app/core/services/ci-provider.service.ts`)
Abstraction over GitHub and GitLab for Chain Builder. Delegates to the correct API service based on `tokens.activeCiProvider()`. Methods: `triggerWorkflow`, `pollGitHubRuns`, `pollGitLabPipeline`, `getLatestTag`, `deleteRepoCaches`, `listWorkflows`, `listRepos`.

### `BoardsProviderService` (`src/app/core/services/boards-provider.service.ts`)
Abstraction over Azure DevOps and Jira for Boards. Delegates based on `tokens.activeBoardsProvider()`.

### `ChainService` (`src/app/core/services/chain.service.ts`)
Persists chains and chain run history to localStorage. Keys: `cdm:chains`, `cdm:chain_runs`.

### `ChainExecutorService` (`src/app/core/services/chain-executor.service.ts`)
Runs chains step-by-step, updates `activeRuns` signal (keyed by chainId). Polls via `CiProviderService`. Logs start/result via `AuditLogService`. Sends browser notifications via `NotificationService`.

### `OrchestratorService` (`src/app/core/services/orchestrator.service.ts`)
Persists graphs and graph run history. Keys: `cdm:orch_graphs`, `cdm:orch_runs`.

### `OrchestratorExecutorService` (`src/app/core/services/orchestrator-executor.service.ts`)
Runs a graph: resolves DAG with `Promise.all` per node, respects `node.disabledSteps`, logs via `AuditLogService`.

### `ReleaseService` (`src/app/core/services/release.service.ts`)
Persists release tracking rows to localStorage. Key: `cdm:releases`.

### `ToastService` (`src/app/shared/services/toast.service.ts`)
In-app toast notifications and confirm dialogs.

### `NotificationService` (`src/app/core/services/notification.service.ts`)
Browser Notification API for chain/step completion.

---

## Core models

### `Chain` (`src/app/core/models/chain.model.ts`)
```typescript
interface Chain {
  id: string;
  name: string;
  defaultRef: string;
  steps: ChainStep[];
  createdAt: string;
}
interface ChainStep {
  id: string;
  repoFullName: string;
  workflowId: number;
  workflowName: string;
  ref: string;
  inputs: Record<string, string>;
  clearCache: boolean;
  useLatestTag: boolean;
  provider?: 'github' | 'gitlab';
}
interface ChainRun { id, chainId, chainName, startedAt, status, steps: ChainStepRun[] }
interface ChainStepRun { stepId, status: StepStatus, startedAt?, completedAt?, error?, runId?, runUrl? }
type StepStatus = 'pending' | 'running' | 'success' | 'failure' | 'skipped'
```

### `OrchGraph` / `OrchNode` / `OrchRun` (`src/app/core/models/orchestrator.model.ts`)
```typescript
interface OrchGraph { id, name, nodes: OrchNode[], edges: OrchEdge[] }
interface OrchNode {
  id, type: 'start' | 'chain', chainId?: string, label: string,
  x, y, disabled?: boolean, disabledSteps?: string[]
}
interface OrchEdge { id, fromId, toId }
interface OrchRun { id, graphId, graphName, startedAt, status, nodes: OrchNodeRun[] }
interface OrchNodeRun { nodeId, status: NodeRunStatus, startedAt?, completedAt?, error? }
type NodeRunStatus = 'idle' | 'running' | 'success' | 'failure' | 'skipped'
```

---

## Feature components

| Feature | Path |
|---|---|
| App shell + session modal | `src/app/app.ts` / `app.html` / `app.scss` |
| Onboarding | `src/app/features/onboarding/` |
| Dashboard | `src/app/features/dashboard/` |
| Pipelines | `src/app/features/github-actions/` |
| Chain Builder | `src/app/features/chain-builder/` |
| Chain Orchestrator | `src/app/features/chain-orchestrator/` |
| Boards | `src/app/features/devops-boards/` |
| Blockers Map | `src/app/features/blockers/` |
| Releases | `src/app/features/releases/` |
| Settings | `src/app/features/settings/` |
| Sprint widget | `src/app/shared/components/sprint-widget/` |
| Work item panel | `src/app/shared/components/work-item-panel/` |
| Toast | `src/app/shared/components/toast/` |

---

## Styling conventions

- Global CSS variables defined in `src/styles.scss`: `--surface-0/1/2`, `--border`, `--text`, `--text-muted`, `--accent`, `--success`, `--danger`, `--radius`
- Utility classes: `.card`, `.btn`, `.btn-sm`, `.btn-primary`, `.btn-danger`, `.btn-outline`, `.form-control`, `.form-group`, `.form-label`, `.text-muted`, `.text-sm`, `.mt-1/2/3`, `.flex-between`, `.spinner`, `.page-header`
- Dark theme only

---

## i18n

All user-facing strings go through `@ngx-translate`. Keys are namespaced: `nav.*`, `settings.*`, `security.*`, `builder.*`, `orch.*`, `boards.*`, `releases.*`, `blockers.*`, `health.*`, `notif.*`, `onboarding.*`, `dashboard.*`, `sprint.*`, `panel.*`, `actions.*`. Both `en.json` and `pt.json` must be kept in sync.

---

## Security model

- All tokens stored in browser only (`sessionStorage` default, `localStorage` opt-in)
- Session inactivity timeout clears tokens and shows a modal (`SessionTimeoutService`)
- Audit log in `localStorage` key `cdm:audit_log` (max 500 entries)
- CSP enforced via `nginx.conf`: `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`
- No token ever leaves the browser except in `Authorization` headers to the provider APIs

---

## Build and formatting rules

- After any HTML or TS edit: run `npx prettier --write <file>`
- Build check: `npx ng build --configuration=production`
- Three SCSS budget warnings are pre-existing (chain-builder, chain-orchestrator, releases) — ignore them, they are not errors
- Never use `!` non-null assertions — use explicit null checks or optional chaining
- Never use write-only class fields (SonarLint S4487)
- Promises in async context must be awaited (SonarLint S4123)
- No variable shadowing (SonarLint S1117)

---

## Known issues / pre-existing warnings

- `releases.component.scss`, `chain-builder.component.scss`, `chain-orchestrator.component.scss` exceed the 8 kB Angular CSS budget. Not errors, just warnings.

---

## Future work (enterprise readiness)

These are tracked in `README.md` under "Future work" and are the planned next items:

1. **Centralised audit log export** — webhook/HTTP endpoint to forward audit entries to a SIEM
2. **SSO / SAML / OIDC** — identity provider integration so PATs can be injected automatically
3. **RBAC** — operator config to restrict destructive actions (trigger, cancel, board moves) by role
4. **PAT expiry enforcement** — warnings based on API responses + configurable max token age
5. **Persistent storage lockout** — build-time or `config.json` flag `allowPersistentStorage: false`
