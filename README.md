# Central Data Manager

A client-side dashboard for managing CI/CD pipelines, work boards, releases and chain automation across multiple providers — all data stays in your browser, no backend required.

## Supported integrations

| Category          | Providers                     |
|-------------------|-------------------------------|
| CI/CD & Pipelines | GitHub Actions, GitLab CI     |
| Work Boards       | Azure DevOps, Jira            |
| Releases          | GitHub, GitLab                |
| Chain Builder     | GitHub Actions, GitLab CI     |

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

The app opens directly on the Settings page — configure your tokens there before using any other feature.

---

## Configuration (tokens)

All tokens are stored locally in your browser (sessionStorage by default, localStorage if you enable persistent storage in Settings). Nothing is sent to any server other than the provider APIs directly.

| Provider         | What you need                                                                    |
|------------------|----------------------------------------------------------------------------------|
| **GitHub**       | Personal Access Token with `repo` and `workflow` scopes + your username/org      |
| **GitLab**       | Personal Access Token with `api` scope + base URL (default `https://gitlab.com`) |
| **Azure DevOps** | Personal Access Token with full access + organisation name                       |
| **Jira**         | Atlassian API token + account email + base URL (e.g. `https://your-org.atlassian.net`) |

Go to **Settings → CI Provider** to switch between GitHub and GitLab. The selected provider is used across Pipelines, Chain Builder and Releases.

Go to **Settings → Boards Provider** to switch between Azure DevOps and Jira. The selected provider is used across Boards, Blockers Map and the sprint widget. After configuring Jira, set the default project under **Settings → Project & Team**.

---

## Features

- **Pipelines** — browse runs, re-run or cancel, and monitor workflow health (success rate, average duration, trend sparklines)
- **Chain Builder** — define ordered sequences of pipelines across multiple repos and run them with a single click; supports per-step branch override, latest-tag resolution and cache clearing
- **Chain Orchestrator** — build pipelines of chains as a visual graph with a drag-and-drop canvas; run entire graphs and inspect execution history
- **Releases** — track which tag/branch is deployed in each environment; compare refs and generate a changelog
- **Boards** — Kanban view of work items with drag-and-drop state transitions, column visibility config and filters; supports Azure DevOps and Jira
- **Blockers Map** — visual dependency graph of blocking work items with transitive impact scores; supports Azure DevOps and Jira
- **Dashboard** — overview of recent pipeline runs and current sprint work items

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

See [SECURITY.md](SECURITY.md) for the security model, token storage details, and how to report vulnerabilities.

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
