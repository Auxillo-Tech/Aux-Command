# Contributing to Aux Command

Aux Command is free, open-source software under AGPL-3.0-or-later. Contributions are welcome.

## Types of contributions

- **Bug reports** — open an issue with reproduction steps, expected vs actual behavior, and environment details.
- **Security reports** — follow the process in `SECURITY.md`; do not open a public issue.
- **Code contributions** — see the pull request workflow below.
- **Documentation** — README, INSTALL, architecture docs, and runbook improvements.

## Pull request workflow

1. Fork the repository or work on a feature branch on `main`.
2. Run validation before opening a PR:
   ```bash
   npm ci
   npm run check
   ```
3. Ensure 127 tests pass and no syntax errors in JS, Python, or shell files.
4. Open a pull request against `main` with a clear description of the change and any security or compatibility implications.
5. CI must pass before merge.

## Code standards

- JavaScript: CommonJS (`.cjs` extensions), no ES modules in the main or preload process.
- Python: 3.11+, standard library only for bundled bridges; no PyPI dependencies.
- Shell: POSIX-compatible; bash-specific features only in build scripts.
- The renderer uses vanilla DOM APIs; no framework or build step.
- All IPC handlers validate the sender is the main window's main frame.

## Security-sensitive areas

Changes to the following require extra review:

- IPC handler registration and sender validation (`src/main/ipc.cjs`)
- Credential storage and encryption (`src/main/services/vault-service.cjs`)
- Process spawning and PTY lifecycle (`src/main/lib/python-pty.cjs`, `src/main/helpers/`)
- Profile export/import (secrets must not leak)
- Update service and release verification (`src/main/services/update-service.cjs`)
- Electron security configuration (`package.json` `electronFuses`, `webPreferences`)

## Release process

See `docs/GITHUB_RELEASES.md` for the full release workflow, including GPG signing with the Aux Command Release Signing key.

## License

By contributing, you agree that your contributions will be licensed under AGPL-3.0-or-later.
