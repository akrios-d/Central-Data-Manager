# Contributing to Central Data Manager

Thank you for your interest in contributing! Please read the guidelines below before opening issues or pull requests.

---

## Licensing of contributions

This project is dual-licensed:

- The public version is released under the **GNU General Public License v3.0** (GPL-3.0).
- A separate **Commercial License** exists for commercial use.

By submitting a pull request or any contribution, you agree that your code will be licensed under the same terms and that the project maintainer (Felipe Oliveira) retains the right to include your contribution in commercial distributions.

If you are not comfortable with this, please do not submit contributions.

---

## Getting started

```bash
git clone https://github.com/your-org/central-data-manager.git
cd central-data-manager
npm install
ng serve
```

---

## How to contribute

### Reporting bugs

Open an issue with:
- A clear title and description
- Steps to reproduce
- Expected vs actual behaviour
- Browser and OS version

### Suggesting features

Open an issue tagged `enhancement`. Describe the use case and the expected behaviour. Check existing issues first to avoid duplicates.

### Submitting a pull request

1. Fork the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
2. Make your changes. Follow the code style of the existing codebase (Angular signals, no unnecessary comments, no extra abstractions).
3. Test your changes manually in the browser.
4. Commit with a clear message describing *why* the change was made.
5. Open a pull request against `main` with a description of what changed and why.

---

## Code style

- Angular 21 with standalone components and signals
- No comments unless the *why* is non-obvious
- No extra abstractions beyond what the task requires
- All user-facing strings go through `i18n/en.json` and `i18n/pt.json`
- No backend — all data stays client-side

---

## Questions

Open an issue or contact **ghfelipe@hotmail.com**.
