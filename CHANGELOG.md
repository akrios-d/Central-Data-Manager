# Changelog

All notable changes to this project will be documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
Versioning: [Semantic Versioning](https://semver.org/)

---

## [1.0.0] — 2026-05-20

Initial public release.

### Added

**CI/CD — Pipelines**
- Browse workflow runs across all repositories (GitHub Actions, GitLab CI)
- Re-run and cancel runs directly from the UI
- Pipeline health dashboard: success rate, average duration, trend sparkline (last 10 runs)

**CI/CD — Chain Builder**
- Create and save ordered sequences of pipelines across multiple repositories
- Per-step branch/ref override and latest-tag resolution at run time
- Optional Actions cache clear before each step
- Enable/disable individual steps without removing them
- Import/export chains as JSON
- Run history with step-level status and GitHub links

**CI/CD — Chain Orchestrator**
- Visual graph editor: drag-and-drop canvas to build pipelines of chains
- Connect chain nodes by dragging edges
- Run entire graphs and inspect execution history

**Releases**
- Track which tag or branch is deployed in each environment
- Add and rename environments
- Compare any two refs: commits ahead/behind, commit list, changelog view
- Copy changelog as Markdown

**Boards (Work Items)**
- Kanban view with drag-and-drop state transitions
- Column visibility and ordering configuration, persisted per user
- Filters: sprint (current / all), work item type, assignee
- Supported providers: Azure DevOps, Jira

**Blockers Map**
- Visual dependency graph of blocking work items
- Transitive impact score per node
- Filter by type, state, or "only blockers"
- Node selection highlights the full downstream subgraph
- Supported providers: Azure DevOps (Dependency-Forward links), Jira ("blocks" issue links)

**Dashboard**
- Overview of recent pipeline runs grouped by repository
- Current sprint widget with progress bar and item list
- Recent work items with state filter chips

**Settings**
- Token management for GitHub, GitLab, Azure DevOps, and Jira
- Active CI provider toggle (GitHub Actions / GitLab CI)
- Active Boards provider toggle (Azure DevOps / Jira)
- Jira project selection for Boards and sprint widget
- Token storage mode: session (default, cleared on tab close) or persistent (localStorage, opt-in with risk warning)
- Chain execution polling interval and max polls configuration
- Danger zone: clear all tokens and return to onboarding

**Internationalisation**
- Full UI available in English and Portuguese

**Deployment**
- Docker image (multi-stage: Node 20 build + Nginx 1.27 serve)
- Nginx configuration with SPA routing, asset caching, security headers, and CSP
- GitHub Actions CI workflow (format check + production build)
