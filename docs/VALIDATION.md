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

RDP qualification checks that the first connection asks to confirm the server certificate, a remembered certificate connects without asking, a changed certificate is reported and refused, and FreeRDP refuses a certificate that does not match the pin. RDP sign-in qualification (`scripts/test-rdp-signin.cjs`) uses a loopback server that requires network level authentication and checks a stored password, a password and user name typed at connection time, a refused password, a cancelled prompt, that a connection without a password does not hang, and that the password never appears in the process list. SFTP sign-in qualification (`scripts/test-sftp-signin.cjs`) uses a loopback OpenSSH server and checks a passphrase-protected key (asked for and stored), the standard key fallback, an unusable key, and a server recorded under a different host key type. Sign-in is qualified on both FreeRDP 2 and FreeRDP 3, which ask for sign-in details differently: `scripts/qualify-linux.sh` uses the client installed on the host, and `scripts/qualify-rdp-freerdp3.sh` runs the same two RDP scripts against FreeRDP 3 in an Ubuntu 24.04 container. `scripts/test-rdp-certificate-electron.cjs` runs inside Electron and reads a certificate with the key-usage field Windows gives its Remote Desktop certificates, which Electron's TLS library refuses during a normal handshake. The fixtures are loopback servers, not a Windows domain server. FTP qualification includes explicit (`AUTH TLS`) and implicit FTPS with a temporary trusted certificate and rejection of a hostname mismatch. These fixture certificates and keys are never packaged.

## Import/recovery UI and installer matrix

With the desktop tools above and Python `websocket-client` installed, run:

```bash
/path/to/test-venv/bin/python scripts/run-ui-qualification.py
bash scripts/test-installers.sh /path/to/candidate-packages
```

The UI runner starts a disposable Electron profile and uses fixture file dialogs. It checks the actual SSH and JSON import buttons, repeat imports, workspace backup/restore and undo, keyboard focus, a doubled display scale, desktop smoke, and twenty session/reload cycles. It prints an evidence directory with logs and screenshots. Installer checks require Docker and pull Debian 12, Ubuntu 24.04 and Fedora 44 images; only the candidate package directory is mounted read-only, and test containers are removed after use. Installer test containers are limited to 3 GB of memory and 2 CPUs (`AUX_TEST_MEMORY`, `AUX_TEST_CPUS`), and the FreeRDP 3 container to 6 GB and 2 CPUs (`AUX_RDP_MEMORY`, `AUX_RDP_CPUS`).

The Linux build and release workflows run these checks automatically. Public tag builds must have the configured signing secret; manual unsigned engineering artifacts remain permitted without publication.

## Building packages on hosts with an older compiler

Rebuilding the native modules for the current Electron needs a recent C++ compiler. On hosts where `npm run dist:x64` fails for that reason (Debian 12, for example), build inside the same Ubuntu 24.04 base the release workflow uses:

```bash
scripts/build-in-container.sh            # packages land in dist/
scripts/build-in-container.sh /tmp/out   # or in a directory of your choice
```

It needs Docker, copies only git-tracked files into a scratch directory and produces unsigned development packages. Do not publish them; signed releases come only from the tagged release workflow. The build container is limited to 6 GB of memory and 2 CPUs; set `AUX_BUILD_MEMORY` and `AUX_BUILD_CPUS` to change that.

