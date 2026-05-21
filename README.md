<div align="center">

# Central Data Manager

**One dashboard. Every CI/CD pipeline, board, release, and chain — all in your browser.**

[![CI](https://github.com/akrios-d/Central-Data-Manager/actions/workflows/ci.yml/badge.svg)](https://github.com/akrios-d/Central-Data-Manager/actions)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL%203.0-blue.svg)](https://github.com/akrios-d/Central-Data-Manager/blob/main/LICENSE)
[![Angular](https://img.shields.io/badge/Angular-21-dd0031?logo=angular)](https://angular.dev)
[![Version](https://img.shields.io/badge/version-1.0.0-success)](https://github.com/akrios-d/Central-Data-Manager/releases)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://centraldatamanager.vercel.app/)

[Live Demo](https://centraldatamanager.vercel.app/) · [Report a Bug](https://github.com/akrios-d/Central-Data-Manager/issues) · [Request a Feature](https://github.com/akrios-d/Central-Data-Manager/issues)

</div>

---

## Why CDM?

Modern development teams work across multiple providers: GitHub for one project, GitLab for another, Azure DevOps for planning, Jira for tickets. Switching between four browser tabs to monitor a release is the norm — not the exception.

**Central Data Manager** solves this by aggregating pipelines, boards, pull requests, releases, and blockers into a single client-side dashboard. There is no backend, no account to create, and no data leaves your browser except in the API calls you already make manually. Tokens are stored in `sessionStorage` by default and cleared when the tab closes.

---

## Supported integrations

| Category           | Providers                              |
| ------------------ | -------------------------------------- |
| CI/CD & Pipelines  | GitHub Actions, GitLab CI              |
| Work Boards        | Azure DevOps, Jira                     |
| Releases           | GitHub Tags, GitLab Tags               |
| Pull / Merge Reqs  | GitHub Pull Requests, GitLab MRs       |
| Chain Builder      | GitHub Actions, GitLab CI              |
| Chain Orchestrator | GitHub Actions, GitLab CI              |

---

## Features

### 🔗 Chain Builder
Define ordered sequences of pipelines across multiple repositories and trigger them with a single click. Per-step branch override, latest-tag resolution at runtime, Actions cache clearing, custom workflow inputs, and step enable/disable toggles. Full run history with step-level status and links to the provider run. Import/export chains as JSON.

### 🕸️ Chain Orchestrator
Build pipelines of chains as a **visual drag-and-drop graph**. Parallel and sequential execution based on DAG topology. Click any chain node to open a live status popup — enable/disable the whole chain or individual steps without deleting them. Import/export graphs as JSON.

### 🚀 Pipelines
Browse workflows and run history across all repositories. Re-run or cancel jobs directly from the UI. The **Pipeline Health** tab shows success rate, average duration, and a trend sparkline (last 10 runs) per workflow.

### 📦 Releases
Track which tag or branch is deployed in each environment per repository. Compare any two refs and view the commit list or an auto-generated changelog. Copy the changelog as Markdown. Supports GitHub and GitLab.

### 📋 Boards
Kanban view with drag-and-drop state transitions. Configurable columns (show/hide, reorder), sprint/assignee/state filters, and a full work-item side panel. Supports Azure DevOps and Jira.

### 🚧 Blockers Map
Visual dependency graph showing which work items are blocking others, with transitive impact scores and a top-blocker ranking. Filter by type, state, or "only blockers". Supports Azure DevOps and Jira.

### 📜 Audit Log
In-browser audit trail (up to 500 entries, FIFO) covering token events, chain runs, session expiry, and settings changes. Filter by category, full-text search, export as CSV, and optionally forward every entry to an HTTP webhook (SIEM, Slack, n8n, Zapier…).

### 📊 Dashboard
Overview of recent pipeline runs and current sprint items from the configured boards provider. Token health indicators show how long ago each PAT was saved, with a warning when approaching the rotation threshold.

---

## Getting started

### Prerequisites

- **Node.js 20 LTS** — [nodejs.org/en/download](https://nodejs.org/en/download) or [nvm](https://github.com/nvm-sh/nvm)
- **Angular CLI 21** — `npm install -g @angular/cli`

### Quick start

```bash
git clone https://github.com/akrios-d/Central-Data-Manager.git
cd Central-Data-Manager
npm install
ng serve
```

Open **http://localhost:4200**. The Onboarding page will guide you through connecting your first provider. You can also configure everything later in **Settings**.

---

## Token configuration

All tokens are stored in your browser only — nothing is sent to any server other than the provider APIs you target directly.

| Provider         | Required credentials                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------- |
| **GitHub**       | PAT with `repo` + `workflow` scopes · your username or org name                               |
| **GitLab**       | PAT with `api` scope · base URL (default `https://gitlab.com`)                                |
| **Azure DevOps** | PAT with full access · organisation name                                                      |
| **Jira**         | Atlassian API token · account email · base URL (e.g. `https://your-org.atlassian.net`)        |

Go to **Settings → CI Provider** to switch between GitHub Actions and GitLab CI across Pipelines, Chain Builder, Orchestrator, and Releases.

Go to **Settings → Boards Provider** to switch between Azure DevOps and Jira across Boards and the Blockers Map.

---

## Deployment

CDM compiles to a folder of static files — any web server can serve it.

```bash
npm run build
# output: dist/Central-Data-Manager/browser/
```

### Option 1 — Docker (recommended)

```bash
docker build -t central-data-manager .
docker run -p 8080:80 central-data-manager
```

Open **http://localhost:8080**. The included `nginx.conf` handles SPA routing, asset caching, and security headers.

### Option 2 — Nginx

```bash
npm run build
cp -r dist/Central-Data-Manager/browser/* /var/www/cdm/
# Copy nginx.conf to /etc/nginx/conf.d/cdm.conf and reload nginx
```

### Option 3 — Netlify / Vercel

Point the platform at `dist/Central-Data-Manager/browser/`. Add a SPA redirect rule:

**Netlify** (`public/_redirects`):
```
/* /index.html 200
```

**Vercel** (`vercel.json`):
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

> **Always serve over HTTPS in production.** Tokens are stored in the browser and must not travel over plain HTTP.

---

## Operator configuration

Place a `config.json` at the root of the served directory to override runtime defaults:

```json
{
  "allowPersistentStorage": false,
  "tokenMaxAgeDays": 60
}
```

| Flag                     | Default | Description                                                           |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `allowPersistentStorage` | `true`  | Set to `false` to hide the persistent storage opt-in in Settings      |
| `tokenMaxAgeDays`        | `90`    | Days before the PAT age indicator turns red on the Dashboard          |

The file is fetched at startup and falls back to defaults if absent or invalid.

---

## Security

| Concern                   | Approach                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Token storage             | `sessionStorage` by default; `localStorage` opt-in with explicit user acknowledgement         |
| Session timeout           | Inactivity timer clears all tokens after a configurable period (default 8 h, session mode)    |
| PAT age warnings          | Dashboard shows time since last save; red indicator after `tokenMaxAgeDays`                   |
| Audit trail               | Up to 500 entries in `localStorage`; optional HTTP webhook forward                            |
| Content Security Policy   | `nginx.conf` restricts `connect-src` to provider API origins; `object-src 'none'`            |
| Workspace export          | Chains, graphs, releases, and settings only — tokens are never exported                       |

See [SECURITY.md](https://github.com/akrios-d/Central-Data-Manager/blob/main/SECURITY.md) for the full security model and vulnerability reporting process.

---

## Tech stack

| Layer       | Choice                                                              |
| ----------- | ------------------------------------------------------------------- |
| Framework   | Angular 21, standalone components, no NgModules                     |
| State       | Angular Signals (`signal`, `computed`, `effect`) — no RxJS state    |
| HTTP        | `HttpClient` with `withFetch()`                                     |
| i18n        | `@ngx-translate/core` — English, Portuguese, French, Chinese        |
| Styling     | Global SCSS variables, per-component SCSS, light/dark theme         |
| Build       | Angular CLI 21 / Vite                                               |
| Container   | Docker multi-stage (Node 20 build → `nginx:alpine` serve)           |
| Testing     | Vitest + Angular Testing Library                                    |

---

## Roadmap

- [ ] Self-hosted GitLab / GitHub Enterprise support
- [ ] Rate-limit retry with exponential back-off
- [ ] Refresh timestamp on each data panel
- [ ] Export audit log as PDF
- [ ] Export release changelogs as CSV
- [ ] Unit test coverage to 80%+
- [ ] SSO / SAML / OIDC reverse-proxy auth layer
- [ ] RBAC operator config (restrict trigger / cancel / board-move by role)

---

## Development

```bash
ng serve           # dev server at http://localhost:4200
npm run build      # production build → dist/
npx vitest run     # unit tests
```

---

## Contributing

Pull requests are welcome. Please open an issue first to discuss what you'd like to change. See [CONTRIBUTING.md](https://github.com/akrios-d/Central-Data-Manager/blob/main/CONTRIBUTING.md) for guidelines.

---

<div align="center">

Made by [Felipe Oliveira](mailto:ghfelipe@hotmail.com) · [Open an issue](https://github.com/akrios-d/Central-Data-Manager/issues) · Licensed under [GPL-3.0](https://github.com/akrios-d/Central-Data-Manager/blob/main/LICENSE)

</div>
