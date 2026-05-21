# Changelog

All notable changes to this project will be documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

### Categories
- **Added** — new features
- **Changed** — changes to existing functionality
- **Deprecated** — features that will be removed in a future release
- **Removed** — features removed in this release
- **Fixed** — bug fixes
- **Security** — vulnerability fixes or security improvements

---

## [Unreleased]

### Planned
- Self-hosted GitLab and GitHub Enterprise support (custom base URL for both providers)
- Rate-limit retry with configurable exponential back-off for all provider API calls
- Refresh timestamp displayed on each data panel (last fetched at)
- Export audit log as PDF
- Export release changelogs as CSV
- Unit test coverage target: 80 %+
- SSO / SAML / OIDC reverse-proxy auth layer (PAT injection, no manual entry)
- RBAC operator config — restrict trigger, cancel, and board-move actions by role via `config.json`

---

## [1.0.0] — 2026-05-20

Initial public release.

### Added

**CI/CD — Pipelines**
- Browse workflow runs across all repositories for GitHub Actions and GitLab CI
- Re-run and cancel runs directly from the dashboard UI
- Pipeline Health tab: per-workflow success rate, average duration, and trend sparkline based on the last 10 runs
- Open any run directly on the provider (GitHub or GitLab) with a single click

**CI/CD — Chain Builder**
- Create, save, and run ordered sequences of pipelines across multiple repositories
- Per-step branch/ref override and latest-tag resolution at run time
- Optional Actions cache clear before each step
- Custom workflow inputs (key/value pairs) per step
- Enable/disable individual steps without removing them from the chain
- Full run history with step-level status, timing, and direct links to provider runs
- Import/export chains as JSON for team sharing
- Supports GitHub Actions and GitLab CI

**CI/CD — Chain Orchestrator**
- Visual graph editor with a drag-and-drop canvas to connect chain nodes
- Parallel and sequential execution resolved from DAG topology (`Promise.all` per dependency level)
- Click a chain node to open a live-status popup: per-step status, enable/disable node or individual steps
- Disable nodes or steps without deleting them (`disabled`, `disabledSteps` flags)
- Full execution history per graph run with per-node status and timing
- Import/export orchestrator graphs as JSON
- Graph node search

**Releases**
- Track which tag or branch is deployed in each environment per repository
- Add, rename, and reorder environments
- Compare any two refs: commits ahead/behind, full commit list, and auto-generated changelog view
- Copy changelog as Markdown to clipboard
- Supports GitHub and GitLab

**Pull Requests**
- Browse open and closed pull requests (GitHub) and merge requests (GitLab) per repository
- Filter by state: Open / Closed / All
- Client-side filter by author and label (no extra API calls)
- Direct links to each PR/MR on the provider

**Boards (Work Items)**
- Kanban view with drag-and-drop state transitions
- Configurable column visibility and ordering, persisted per user
- Filters: sprint (current / all), work item type, assignee
- Full work-item side panel with all fields
- Supports Azure DevOps and Jira

**Blockers Map**
- Visual dependency graph of blocking work items
- Transitive impact score per node
- Top-blockers ranking panel
- Filter by type, state, or "only blockers"
- Node selection highlights the full downstream subgraph
- Supports Azure DevOps (Dependency-Forward links) and Jira ("blocks" issue links)

**Dashboard**
- Overview of recent pipeline runs grouped by repository
- Current sprint widget with progress bar and work item list
- Token health bar — shows time since each PAT was saved, red indicator when exceeding `tokenMaxAgeDays`
- Recent audit log entries and a shortcut to the most recent chain run

**Settings**
- Token management for GitHub, GitLab, Azure DevOps, and Jira with connection status and age indicator
- Active CI provider toggle (GitHub Actions / GitLab CI)
- Active Boards provider toggle (Azure DevOps / Jira)
- Jira project selection for the Boards view and sprint widget
- Token storage mode: session-only (default, cleared on tab close) or persistent (`localStorage`, opt-in with risk warning)
- Chain execution polling interval (default 6 s, range 2–60 s) and max polls per step (default 120, range 10–500)
- Session inactivity timeout (default 8 h, range 1–24 h, session mode only)
- Browser notifications toggle for chain step completion
- Audit webhook: forward every audit entry as a JSON POST to a custom URL (SIEM, Slack, n8n, Zapier…)
- Workspace export (chains, graphs, releases, settings) and import — tokens are never included
- Danger zone: clear all tokens and return to onboarding

**Audit Log**
- Persistent in-browser audit trail in `localStorage` (max 500 entries, FIFO)
- Events logged: token save/remove, chain and graph run start and result, session expiry, settings changes, workspace export/import
- Filter by event category and full-text search
- Export as CSV
- Clear log with confirmation dialog
- Optional HTTP webhook forward — fire-and-forget POST; failures are silently ignored

**Security**
- Session inactivity timeout (configurable, default 8 h) clears all tokens in session mode
- PAT age tracking: `savedAt` timestamps in `localStorage`; Dashboard warns when approaching `tokenMaxAgeDays`
- Operator config via `public/config.json`: `allowPersistentStorage` and `tokenMaxAgeDays` loaded at startup via `APP_INITIALIZER`
- `allowPersistentStorage: false` hides the persistent storage option entirely in Settings
- CSP enforced via `nginx.conf`: `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, `connect-src` limited to provider API origins

**Internationalisation**
- Full UI available in English (`en`), Portuguese (`pt`), French (`fr`), and Chinese (`zh`)
- Language selection persisted across sessions

**Deployment**
- Docker multi-stage image: Node 20 build + `nginx:alpine` serve
- `nginx.conf` with SPA routing, static asset caching, security headers, and strict CSP
- GitHub Actions CI workflow: Prettier format check + production build on every push and pull request
- Vercel deployment at [centraldatamanager.vercel.app](https://centraldatamanager.vercel.app/)

---

[Unreleased]: https://github.com/akrios-d/Central-Data-Manager/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/akrios-d/Central-Data-Manager/releases/tag/v1.0.0
