# Central Data Manager

A client-side dashboard for managing CI/CD pipelines, work boards, releases and chain automation across multiple providers — all data stays in your browser, no backend required.

## Supported integrations

| Category           | Providers                   |
| ------------------ | --------------------------- |
| CI/CD & Pipelines  | GitHub Actions, GitLab CI   |
| Work Boards        | Azure DevOps, Jira          |
| Releases           | GitHub, GitLab              |
| Pull Requests      | GitHub, GitLab              |
| Chain Builder      | GitHub Actions, GitLab CI   |
| Chain Orchestrator | GitHub Actions, GitLab CI   |

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
Overview of recent pipeline runs and the current sprint work items from the configured boards provider. Includes:
- **Token health bar** — shows how long ago each provider token was saved, with a warning when approaching the configured maximum age
- **Recent activity** — last 5 audit log entries and a shortcut to the most recent chain run

### Pipelines
Browse repositories and workflows, inspect run history, re-run or cancel jobs, and open runs directly in GitHub or GitLab. Includes a **Pipeline Health** tab with success rate, average duration and a trend sparkline for each workflow.

### Pull Requests
Browse open and closed pull requests (GitHub) and merge requests (GitLab) per repository.

- Filter by state: Open / Closed / All
- Client-side filter by author and label (no additional API calls)
- Direct links to each PR/MR on the provider

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

### Audit Log
Dedicated page for reviewing and exporting the in-browser audit trail.

- Filter by event category (tokens, chains, graphs, session, settings)
- Full-text search across entries
- Export as CSV
- Clear log with confirmation

---

## Settings

### Integrations
Configure tokens for GitHub, GitLab, Azure DevOps and Jira. Each provider shows connection status, the owner/org, and how long ago the token was saved.

### CI / Boards Provider
Switch the active provider for pipelines and boards independently.

### Token Storage
Session-only mode (default) clears tokens when the browser closes or after inactivity. Opt-in persistent storage saves tokens to `localStorage` — requires explicit acceptance of the security risk. Persistent storage can be disabled at the operator level via `config.json`.

### Chain Execution
Configure the polling interval (default 6 s) and maximum polls per step (default 120) used when monitoring pipeline runs.

### Session Timeout
Configurable inactivity limit in session-only mode (default 8 h, range 1–24 h).

### Browser Notifications
Toggle desktop notifications for chain step completion. Includes a browser permission request flow.

### Audit Webhook
Forward every audit log entry as a JSON POST to a custom HTTP endpoint (SIEM, Slack, n8n, Zapier, etc.). The endpoint must accept CORS POST requests. Includes a test button to verify connectivity.

### Workspace Backup
Export all chains, graphs, releases and settings to a single JSON file. Import a previously exported workspace. Tokens are never included in the export.

---

## Security features

### Session inactivity timeout
In session-only mode the app automatically clears all tokens after a configurable period of inactivity (default 8 h). A modal overlay appears when the session expires — no automatic redirect.

### PAT age warnings
The dashboard shows how long ago each provider token was last saved. When the age exceeds the operator-configured threshold (`tokenMaxAgeDays`, default 90 d), the indicator turns red as a rotation reminder.

### Audit log
Key actions are logged to the browser's `localStorage` (up to 500 entries, FIFO):
- Token save / remove events per provider
- Chain and graph run start and result
- Session expiry events
- Execution settings changes
- Workspace export / import

The log is visible in **Audit Log** and clearable there or in **Settings**.

### Audit webhook
Each audit entry can optionally be forwarded to an HTTP endpoint configured in Settings. The browser POSTs directly to the endpoint — no intermediate server. Failed posts are silently ignored to keep the audit log functional.

### Operator config (`public/config.json`)
Served alongside the app at runtime. Supports two flags:

```json
{
  "allowPersistentStorage": false,
  "tokenMaxAgeDays": 60
}
```

If the file is absent, defaults apply (`allowPersistentStorage: true`, `tokenMaxAgeDays: 90`).

### Content Security Policy
The provided `nginx.conf` enforces a strict CSP:
- `default-src 'self'`
- `connect-src` limited to GitHub, GitLab, Azure DevOps and Jira API endpoints
- `object-src 'none'`
- `base-uri 'self'`
- `frame-ancestors 'none'`

---

## Light / Dark theme

Toggle between light and dark themes using the ☀/🌙 button in the sidebar. The preference is saved to `localStorage` and applied immediately on next load (no flash of unstyled content).

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

### Operator config

Place a `config.json` file at the root of the served directory to override defaults:

```json
{
  "allowPersistentStorage": false,
  "tokenMaxAgeDays": 60
}
```

The app fetches this file at startup and falls back to defaults if it is absent or invalid.

### HTTPS

Always serve over HTTPS in production. Tokens are stored in the browser and must not travel over plain HTTP.

---

## Security

See [SECURITY.md](SECURITY.md) for the full security model, token storage details, and how to report vulnerabilities.

---

## Future work (enterprise readiness)

The following items are identified gaps for formal enterprise or compliance deployments.

### SSO / SAML / OIDC integration
The app has no centralised authentication — each user manages their own PATs. Enterprise deployments should be placed behind an identity provider (Azure AD, Okta, etc.). A future reverse-proxy auth layer or OIDC callback page would allow session tokens to be injected automatically, removing the need for manual PAT entry.

### Role-based access control (RBAC)
There is currently no distinction between read-only and write users. Anyone with access to the URL can trigger pipelines and modify boards. Planned: an operator-level config that can restrict destructive actions (trigger, cancel, board moves) to specific users or groups.

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
