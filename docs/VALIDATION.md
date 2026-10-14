# Validation

Run the full source validation from the repository root:

```bash
npm run check
```

This performs:

1. Node syntax checks for every `.js` and `.cjs` file outside generated dependency/build directories.
2. Python AST parsing for the PTY bridge.
3. `bash -n` checks for all bundled shell scripts.
4. The Node test suite, including real PTY, process-lifecycle integration, tunnel failure-state, credential persistence, and renderer lifecycle regression tests.

For a clean source checkout with network access:

```bash
./scripts/bootstrap.sh
npm start
```

To create Linux packages for the configured Linux x86_64 release targets:

```bash
npm run dist
```

To create the verified x64 Linux artifacts on this Fedora workstation:

```bash
npm run dist:x64 -- --publish never
```

`dist:x64` wraps Electron Builder with local compatibility handling for build-host gaps seen on current Fedora: missing `libcrypt.so.1` for Electron Builder's bundled `fpm`, and missing `rpmbuild` for RPM creation. The wrapper downloads/extracts only the required Fedora build packages under `.cache/` when needed; it does not install system packages.

The GitHub Actions workflow at `.github/workflows/linux-build.yml` performs validation and creates x86_64 AppImage, Debian and RPM artifacts without publishing them from normal branch CI.

## Controlled protocol and updater qualification

These explicit integration commands are separate from `npm run check`. They create temporary profiles, keys and loopback servers. Run them in a development environment with the named tools installed.

```bash
# OpenSSH server/client, mosh client/server; non-root test user
node scripts/test-mosh-tunnels.cjs

# Xvfb, xauth, x11vnc, xwininfo, xfreerdp and freerdp-shadow-cli
xvfb-run -a node scripts/test-rdp-vnc.cjs

# A Python virtual environment containing pyftpdlib and pyOpenSSL; OpenSSL CLI
AUX_FTP_TEST_PYTHON=/path/to/test-venv/bin/python node scripts/test-ftp.cjs

# Network access to public GitHub Releases; Electron runtime dependencies
xvfb-run -a node_modules/electron/dist/electron scripts/test-live-updater.cjs
```

The updater test uses a simulated old application version and the real public release/signature/download services. It replaces only a disposable AppImage path, intercepts the automatic desktop launch, and prints the resulting path for inspection. It does not publish anything or replace your installed application. The temporary directory is intentionally retained for inspection; remove the printed test directory when finished.

RDP qualification checks that the first connection asks to confirm the server certificate, a remembered certificate connects without asking, a changed certificate is reported and refused, and FreeRDP refuses a certificate that does not match the pin. The fixture uses a loopback TLS RDP server, not a Windows domain server. FTP qualification includes implicit FTPS with a temporary trusted certificate and rejection of a hostname mismatch. These fixture certificates and keys are never packaged.

## Import/recovery UI and installer matrix

With the desktop tools above and Python `websocket-client` installed, run:

```bash
/path/to/test-venv/bin/python scripts/run-ui-qualification.py
bash scripts/test-installers.sh /path/to/candidate-packages
```

The UI runner starts a disposable Electron profile and uses fixture file dialogs. It checks the actual SSH and JSON import buttons, repeat imports, workspace backup/restore and undo, keyboard focus, a doubled display scale, desktop smoke, and twenty session/reload cycles. It prints an evidence directory with logs and screenshots. Installer checks require Docker and pull Debian 12, Ubuntu 24.04 and Fedora 44 images; only the candidate package directory is mounted read-only, and test containers are removed after use.

The Linux build and release workflows run these checks automatically. Public tag builds must have the configured signing secret; manual unsigned engineering artifacts remain permitted without publication.
