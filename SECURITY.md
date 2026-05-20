# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability, **do not open a public issue**.

Contact the maintainer privately:

**Felipe Oliveira** — ghfelipe@hotmail.com

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested fix (optional)

You will receive a response within **5 business days**. Once the issue is confirmed and fixed, a public disclosure will be coordinated with you.

---

## Security model

Central Data Manager is a **100% client-side application**. There is no backend server, no database, and no data is transmitted to any server other than the configured provider APIs (GitHub, GitLab, Azure DevOps, Jira) directly from your browser.

### Token storage

API tokens are stored in the browser only:

| Mode | Storage | Cleared when |
|---|---|---|
| Session (default) | `sessionStorage` | Browser tab/window is closed |
| Persistent | `localStorage` | Manually via Settings → Clear all tokens |

**Persistent storage is opt-in and carries a risk warning** — anyone with physical or remote access to the device can read tokens from `localStorage` using browser developer tools.

### Recommendations for users

- **Always use HTTPS** when self-hosting. Never serve this app over plain HTTP.
- Prefer **session storage** (default) unless you have a specific need for persistence.
- Use **fine-grained tokens** with the minimum required scopes:
  - GitHub: `repo` (read) + `actions` (read/write) — avoid full `repo` write if not needed
  - GitLab: `api` (read) — use `read_api` if you only need to read pipelines
  - Azure DevOps: scope to specific projects when possible
  - Jira: API token is scoped to your Atlassian account — treat it as a password
- **Do not deploy this app on a shared or public device** if using persistent storage.

### Recommendations for self-hosters

- Serve the app behind a reverse proxy (e.g. Nginx) with the security headers defined in `nginx.conf`.
- Restrict access via IP allowlist or VPN if this is for internal use only.
- Enable the CSP header in `nginx.conf` and tighten the `connect-src` directive to only the providers you actually use.
- Keep the Docker image updated — run `docker pull` regularly to get security patches from the base `nginx:alpine` image.

---

## Scope

The following are considered in scope for vulnerability reports:

- XSS vulnerabilities in the Angular templates
- Token leakage outside the browser (e.g. via fetch to unexpected origins)
- CSP bypasses in the provided `nginx.conf`
- Any mechanism that would allow a third party to read stored tokens without physical device access

The following are **out of scope**:

- Attacks that require physical access to the device
- Vulnerabilities in third-party provider APIs (GitHub, GitLab, etc.) — report those to the respective providers
- Self-inflicted risk from choosing persistent storage after accepting the warning
