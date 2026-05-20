# Central Data Manager

A client-side dashboard for managing CI/CD pipelines, work boards, releases and chain automation across multiple providers — all data stays in your browser, no backend required.

## Supported integrations

| Category          | Providers                              |
| ----------------- | -------------------------------------- |
| CI/CD & Pipelines | GitHub Actions, GitLab CI              |
| Work Boards       | Azure DevOps, Jira                     |
| Releases          | GitHub, GitLab                         |
| Chain Builder     | GitHub Actions, GitLab CI              |
| Chain Orchestrator| GitHub Actions, GitLab CI              |

---

## Prerequisites

### 1. Node.js

Download and install **Node.js 20 LTS** (or later) from:

- **Windows / macOS**: https://nodejs.org/en/download — use the LTS installer
- **Linux**: use your package manager or [nvm](https://github.com/nvm-sh/nvm)

```bash
# Verify installation
node -v   # should print v20.x.x or higher
npm -v    # should print 10.x.x or higher
```

### 2. Angular CLI

```bash
npm install -g @angular/cli
```

```bash
# Verify installation
ng version   # should show Angular CLI 21.x.x
```

---

## Getting started

```bash
# 1. Clone the repository
git clone https://github.com/your-org/central-data-manager.git
cd central-data-manager

# 2. Install dependencies
npm install

# 3. Start the development server
ng serve
```

Open your browser at **http://localhost:4200**.

On first launch the Onboarding page will guide you through connecting your integrations. You can also configure everything later in **Settings**.

---

## Configuration (tokens)

All tokens are stored locally in your browser (sessionStorage by default, localStorage if you opt in to persistent storage in Settings). Nothing is sent to any server other than the provider APIs directly.

| Provider         | What you need                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------- |
| **GitHub**       | Personal Access Token with `repo` and `workflow` scopes + your username/org                 |
| **GitLab**       | Personal Access Token with `api` scope + base URL (default `https://gitlab.com`)            |
| **Azure DevOps** | Personal Access Token with full access + organisation name                                  |
| **Jira**         | Atlassian API token + account email + base URL (e.g. `https://your-org.atlassian.net`)      |

Go to **Settings → CI Provider** to switch between GitHub and GitLab. The selected provider is used across Pipelines, Chain Builder, Orchestrator and Releases.

Go to **Settings → Boards Provider** to switch between Azure DevOps and Jira. The selected provider is used across Boards, Blockers Map and the sprint widget. After configuring Jira, set the default project under **Settings → Sprint Project**.

---

## Features

### Dashboard
Overview of recent pipeline runs and the current sprint work items from the configured boards provider.

### Pipelines
Browse repositories and workflows, inspect run history, re-run or cancel jobs, and open runs directly in GitHub or GitLab. Includes a **Pipeline Health** tab with success rate, average duration and a trend sparkline for each workflow.

### Chain Builder
Define ordered sequences of pipelines across multiple repositories and trigger them with a single click.

- Per-step branch/ref override or latest-tag resolution at runtime
- Clear Actions cache before a step
- Custom workflow inputs (key/value)
- Step enable/disable toggles for one-off runs
- Full run history with step-level status and links to provider runs
- Import / Export chains as JSON
- Supports GitHub Actions and GitLab CI

### Chain Orchestrator
Build pipelines of chains as a **visual graph** with a drag-and-drop canvas.

- Connect chain nodes by dragging edges between them
- Parallel and sequential execution depending on graph topology
- Click any chain node to open a popup: live status, step list, enable/disable the whole chain or individual steps
- Disable individual nodes or steps without deleting them
- Run full graphs and inspect execution history per run
- Import / Export graphs as JSON
- Graph search

### Releases
Track which tag or branch is deployed in each environment per repository.

- Compare two refs and view commit list or auto-generated changelog
- Copy changelog as Markdown
- Supports GitHub and GitLab

### Boards
Kanban view of your work items with drag-and-drop state transitions.

- Configurable columns (show/hide, reorder)
- Filter by sprint, assignee and state
- Side panel with full work item details
- Supports Azure DevOps and Jira

### Blockers Map
Visual dependency graph showing which work items are blocking others and their transitive impact score.

- Top-blockers ranking
- Filter by type, state and whether an item blocks others
- Supports Azure DevOps and Jira

---

## Security features

### Session inactivity timeout
In session-only mode the app automatically clears all tokens after a configurable period of inactivity (default 8 h, adjustable in **Settings → Chain Execution**). A modal overlay appears when the session expires — no automatic redirect.

### Audit log
Key actions are logged to the browser's `localStorage` (up to 500 entries, FIFO):
- Token save / remove events per provider
- Chain and graph run start and result
- Session expiry events
- Execution settings changes

The log is visible and clearable in **Settings → Audit Log**.

### Content Security Policy
The provided `nginx.conf` enforces a strict CSP:
- `default-src 'self'`
- `connect-src` limited to GitHub, GitLab, Azure DevOps and Jira API endpoints
- `object-src 'none'`
- `base-uri 'self'`
- `frame-ancestors 'none'`

---

## Deployment

Central Data Manager compiles to a folder of static files — any web server can serve it.

### Production build

```bash
npm run build
# output: dist/Central-Data-Manager/browser/
```

### Option 1 — Docker (recommended)

```bash
# Build image
docker build -t central-data-manager .

# Run on port 8080
docker run -p 8080:80 central-data-manager
```

Open **http://localhost:8080**.

### Option 2 — Nginx (static files)

```bash
npm run build
cp -r dist/Central-Data-Manager/browser/* /var/www/central-data-manager/
```

Copy `nginx.conf` from this repository to `/etc/nginx/conf.d/central-data-manager.conf` and adjust the `root` path. The config includes SPA fallback routing, asset caching, and security headers.

### Option 3 — Netlify / Vercel / GitHub Pages

Point the platform at the `dist/Central-Data-Manager/browser/` output folder. For Netlify and Vercel, add a redirect rule so all routes return `index.html` (required for client-side routing):

**Netlify** — create `public/_redirects`:
```
/* /index.html 200
```

**Vercel** — create `vercel.json`:
```json
{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
```

### HTTPS

Always serve over HTTPS in production. Tokens are stored in the browser and must not travel over plain HTTP.

---

## Security

See [SECURITY.md](SECURITY.md) for the full security model, token storage details, and how to report vulnerabilities.

---

## Future work (enterprise readiness)

The following items are identified gaps for formal enterprise or compliance deployments. They are tracked here as future work.

### Centralised audit log export
The current audit log lives in the user's browser (`localStorage`). For SOC 2 / ISO 27001 compliance, events should be forwarded to a SIEM or a configurable HTTP endpoint. Planned: an optional audit webhook setting that POSTs each entry to a URL defined by the operator.

### SSO / SAML / OIDC integration
The app has no centralised authentication — each user manages their own PATs. Enterprise deployments should be placed behind an identity provider (Azure AD, Okta, etc.). A future reverse-proxy auth layer or OIDC callback page would allow session tokens to be injected automatically, removing the need for manual PAT entry.

### Role-based access control (RBAC)
There is currently no distinction between read-only and write users. Anyone with access to the URL can trigger pipelines and modify boards. Planned: an operator-level config (injected at build time or via a `config.json`) that can restrict destructive actions (trigger, cancel, board moves) to specific users or groups.

### PAT expiry enforcement
The app does not track when tokens expire or enforce a rotation policy. Planned: token expiry warnings based on GitHub / GitLab API responses, and a configurable maximum token age that forces re-entry.

### Persistent storage lockout for shared devices
The opt-in persistent storage mode can be disabled at the operator level to prevent tokens from surviving browser restarts on shared devices. Planned: a build-time or `config.json` flag `allowPersistentStorage: false` that hides the option in Settings.

---

## Development

```bash
# Start dev server with hot reload
ng serve

# Production build
npm run build

# Run unit tests
ng test
```

Build output goes to `dist/Central-Data-Manager/browser/`.
