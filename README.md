🌐 **English** · [Deutsch](README.de.md) · [简体中文](README.zh.md) · [Italiano](README.it.md) · [Español](README.es.md) · [Français](README.fr.md) · [日本語](README.ja.md) · [Português](README.pt.md)

# Aux Command

**Aux Command** is Auxillo’s free, open-source Linux-native remote-operations workstation: a secure desktop console for operators who need SSH terminals, SFTP, tunnels, remote-desktop launchers, Mosh, Telnet, serial consoles, local shells, profiles, and release-grade operational tooling in one application.

It is built as an original Auxillo public product with native Linux tooling, explicit trust boundaries, modern Electron hardening, no paid feature walls, and verifiable release engineering.

> Current status: **0.2.x Linux x86_64 engineering release**. The repository, GitHub Actions, package builds, release/update wiring, security documentation, GPG-signed releases, and source validation are in place. Releases are cryptographically signed with the Aux Command Release Signing key.

---

## Product overview

Aux Command is designed for technical operators, infrastructure teams, and security engineers who need to move quickly across local and remote systems without scattering work between many uncoordinated tools.

It provides:

- a tabbed terminal workspace;
- persistent connection profiles;
- quick-connect workflows for network targets and serial devices;
- native OpenSSH terminal sessions;
- graphical SFTP file operations;
- local, remote, and dynamic SSH tunnels;
- local shell sessions;
- Mosh, Telnet, serial, RDP, and VNC entry points;
- keyboard-oriented workflow controls;
- update/release diagnostics;
- security-first storage and process-lifecycle behavior.

The design is intentionally conservative where security matters. Aux Command delegates mature protocol behavior to audited Linux tools when that is safer than embedding a protocol surface inside Electron, and it uses bundled helpers only where a small controlled bridge is safer and more portable.

---

## Supported operating systems

Aux Command is currently a **Linux desktop application**.

| Operating system family | Status | Recommended package | Notes |
|---|---:|---|---|
| Fedora Workstation / Fedora KDE x86_64 | Supported engineering target | `.rpm` or AppImage | Primary local development and package-build environment. |
| Ubuntu LTS x86_64 | Supported engineering target | `.deb` or AppImage | CI builds on Ubuntu 24.04. Runtime tools install through `apt`. |
| Debian 12+ x86_64 | Expected supported | `.deb` or AppImage | Uses the Debian package dependency model; verify on the target desktop before production rollout. |
| RHEL / Rocky / AlmaLinux x86_64 | Expected supported | `.rpm` or AppImage | Requires modern desktop libraries and OpenSSH/Python runtime packages. |
| openSUSE x86_64 | Expected supported | `.rpm` or AppImage | Runtime tools install through `zypper`; validate package policy locally. |
| Arch Linux / EndeavourOS / Manjaro x86_64 | Source/AppImage path | AppImage or source | No native pacman package is produced yet; runtime tools install through `pacman`. |
| Other modern x86_64 Linux desktops | Best effort | AppImage | Requires a graphical session and standard Electron/Linux desktop dependencies. |
| Windows | Not supported | — | No Windows package is currently produced. |
| macOS | Not supported | — | No macOS package is currently produced. |
| Linux ARM64 | Not currently shipped | — | The code is not intentionally x86-only, but current release artifacts are x86_64 only. |

Desktop environments expected to work include GNOME, KDE Plasma, Xfce, Cinnamon, and other modern X11/Wayland desktops with the normal Electron runtime stack. Wayland and X11 both require target-distro validation before a public production claim.

---

## Installation

Full instructions are in [`INSTALL.md`](INSTALL.md).

### AppImage — portable Linux install

Use this when you want the least invasive installation path.

```bash
chmod +x Aux-Command-0.1.0-x86_64.AppImage
./Aux-Command-0.1.0-x86_64.AppImage
```

If the host does not support AppImage FUSE mounting, extract and run it:

```bash
./Aux-Command-0.1.0-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

### Debian / Ubuntu

```bash
sudo apt install ./Aux-Command-0.1.0-amd64.deb
aux-command
```

The Debian package declares the core runtime dependencies:

- `python3`
- `openssh-client`

### Fedora / RHEL / Rocky / AlmaLinux / openSUSE

Fedora / RHEL-style systems:

```bash
sudo dnf install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

openSUSE-style systems:

```bash
sudo zypper install ./Aux-Command-0.1.0-x86_64.rpm
aux-command
```

The RPM declares the core runtime dependencies:

- `python3`
- `openssh-clients`

### Optional protocol tools

Aux Command can run core local, SSH, SFTP, tunnel, Telnet, and serial workflows with Python/OpenSSH plus bundled helpers. Some protocols intentionally use external Linux clients:

| Feature | External tool | Why |
|---|---|---|
| Mosh | `mosh` | Mosh requires the host client and a compatible remote `mosh-server`. |
| RDP | FreeRDP (`xfreerdp`) | Keeps RDP certificate, clipboard, and display behavior at the distro-managed client boundary. |
| VNC | TigerVNC (`vncviewer`) | Keeps VNC rendering and auth behavior at the distro-managed client boundary. |
| X11 forwarding | OpenSSH + local X11/Xwayland | Trust-expanding SSH feature, disabled by default. |

Install optional runtime tools with:

```bash
./scripts/install-runtime-tools.sh
```

---

## What Aux Command does

### Terminal workspace

- PTY-backed terminal tabs rendered with xterm.js.
- Local shell sessions.
- Per-profile terminal theme, font, cursor, and scrollback settings.
- Terminal tab lifecycle with close confirmations for live sessions.
- Split/tiled multi-session layouts.
- Terminal search.
- Active-session transcript export with local review/copy/save/print controls.
- Explicit per-session terminal logging to a local operator-selected file.
- Command palette.
- Command snippets.
- Guarded macro recording that saves reviewed terminal input as replayable snippets.
- Guarded broadcast input across terminal sessions.
- Keyboard-first navigation and accessible tab/panel relationships.

### SSH operations

- Native OpenSSH sessions.
- SSH agent support through the user’s existing environment.
- `~/.ssh/config` import support.
- Identity files.
- Advanced per-profile OpenSSH known-hosts-file override for isolated lab or fixture profiles.
- ProxyJump support.
- Compression, keepalive, X11 forwarding, and agent forwarding controls.
- Literal remote startup commands passed safely as OpenSSH arguments.
- No local shell interpolation of profile values.
- Explicit SCP fallback transfer mode for legacy SSH servers that do not expose SFTP; SFTP remains the default and SCP is limited to upload/download style file transfer.

### SFTP

- Graphical SFTP browser backed by `ssh2`.
- Explicit host-key fingerprint confirmation.
- Upload, drag-and-drop upload, download, inline UTF-8 text file view/edit, folder creation, rename, and delete operations.
- Inline remote editing uses a temporary upload plus OpenSSH POSIX rename where supported, with a 1 MB safety limit for in-app edits.
- Separate treatment for account passwords and private-key passphrases.
- Persistent SFTP secrets only when Linux desktop safe storage is encrypted.
- Unsafe Electron `basic_text` secret storage is rejected.
- Profile exports omit secrets and credential identifiers.

### SCP fallback

- SSH profiles can opt into SCP fallback transfer mode for constrained legacy servers.
- SCP uses OpenSSH `scp -O` in batch mode with direct argument arrays and private temporary download staging.
- SCP fallback supports regular file upload/download only; directory browsing, mkdir, rename, delete, and inline remote editing require SFTP.
- Stored GUI-vault account passwords are refused for SCP fallback because external `scp` cannot consume them safely; use SSH agent or an identity file.

### FTP / FTPS

- FTP and FTPS file-browser profiles backed by `basic-ftp`.
- FTPS uses encrypted TLS transport.
- Plain FTP is guarded by an explicit insecure-transport warning because credentials and file contents are not encrypted.
- FTP/FTPS reuse the graphical file-browser operations for browse, upload, drag-and-drop upload, download, inline UTF-8 text edit, mkdir, rename, and delete.
- Persistent FTP/FTPS secrets use the same encrypted Linux safe-storage checks as SFTP secrets.

### SSH tunnels

- Local forwards.
- Remote forwards.
- Dynamic SOCKS forwards.
- Evidence-based tunnel readiness using OpenSSH readiness behavior, not elapsed-time guessing.
- Stop controls and lifecycle tracking.
- Background tunnel runs use `BatchMode=yes`, so invisible password prompts do not hang in the background.

### Protocol launchers and bridges

- Mosh launcher with safely constructed SSH transport options.
- RDP launcher through FreeRDP.
- VNC launcher through TigerVNC.
- Bundled Python Telnet bridge.
- Bundled Python raw serial bridge.
- Serial quick connect with absolute Linux device paths such as `/dev/ttyUSB0`.
- Bundled Python PTY helper.
- Parent-death process guard so abnormal Electron exit does not leave helpers unmanaged.

### Release and diagnostics

- GitHub Releases update path wired through `electron-updater`.
- Top-level Updates toolbar control plus diagnostics UI for update state and package behavior.
- GitHub Actions Linux build pipeline.
- AppImage, `.deb`, and `.rpm` package outputs for x86_64.
- CycloneDX SBOM generation.
- Release manifest and SHA-256 checksum verification.
- Source archive generation with dependency/build/cache directories excluded.

---

## Security model

Aux Command is built for security-sensitive operations. The implementation favors explicit boundaries over invisible convenience.

Key controls:

- Electron renderer sandbox enabled.
- `contextIsolation` enabled.
- Node integration disabled in the renderer.
- Chromium permission requests denied by default.
- External navigation and popup creation denied by default.
- Privileged IPC validates sender window and frame.
- Direct process spawning with argument arrays; no profile values are passed through a local shell.
- Managed helper processes use an exact-parent Linux death-signal guard.
- Graphical SFTP host keys are explicitly verified and stored separately from OpenSSH.
- SFTP secrets are stored persistently only when encrypted desktop safe storage is available.
- Profile exports exclude secret material.
- Telnet and some VNC deployments are recognized as potentially unencrypted legacy paths.

Security documentation:

- [`SECURITY.md`](SECURITY.md) — vulnerability reporting policy.
- [`docs/SECURITY.md`](docs/SECURITY.md) — detailed security model.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — trust boundaries and process architecture.

---

## Build from source

Requirements:

- Linux x86_64 desktop.
- Node.js `>=22`.
- npm.
- Python 3.
- OpenSSH client.

Bootstrap and run:

```bash
./scripts/bootstrap.sh
npm start
```

Development mode:

```bash
npm run dev
```

Validate source:

```bash
npm run check
```

Build x86_64 Linux packages without publishing:

```bash
npm run dist:x64 -- --publish never
```

The Fedora build wrapper handles common local packaging gaps by downloading build helpers under the ignored `.cache/` directory instead of installing system packages automatically.

---

## Verification status

Current source validation passes:

```text
Syntax validated for 50 JavaScript files.
Syntax validated for 5 Python files.
Syntax validated for 5 shell scripts.
119 tests passed.
```

Latest GitHub Actions `Linux build` on `main` completed successfully and produced the `aux-command-linux-x64` workflow artifact.

The release is still classified as an engineering release candidate because these gates remain open:

- no signed public release yet;
- no published immutable GitHub Release tag yet;
- no Auxillo-controlled production signing key configured;
- artifact attestations are blocked while the repository is private under the current GitHub plan;
- branch protection is blocked while the repository is private under the current GitHub plan;
- broader live qualification is still required across representative SSH/SFTP/tunnel/Mosh/RDP/VNC/X11/serial environments.

See [`docs/RELEASE_STATUS.md`](docs/RELEASE_STATUS.md) and [`docs/LIVE_QUALIFICATION.md`](docs/LIVE_QUALIFICATION.md).

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Focus quick connect |
| `Ctrl+Shift+T` | Open local terminal |
| `Ctrl+Shift+F` | Toggle SFTP |
| `Ctrl+W` | Close active tab |
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+Shift+V` | Paste into terminal |

Tiled/single-session layout and tiled pane-size toolbar choices are persisted locally and restored on restart.

Right-click copies selected terminal text; with no selection it pastes clipboard text.

---

## Data location

Application data is stored beneath Electron’s Linux `userData` location, normally:

```text
~/.config/Aux Command/aux-command-data/
```

Typical data includes profiles, command snippets, SFTP known-host fingerprints, workstation layout settings, and non-secret application state. Persistent SFTP secrets use the Linux desktop secret storage backend when that backend is encrypted.

---

## Documentation map

| Document | Purpose |
|---|---|
| [`INSTALL.md`](INSTALL.md) | End-user installation by Linux distribution/package type. |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Runtime architecture, trust boundaries, storage, and protocol delegation. |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Implemented security controls and reporting expectations. |
| [`docs/GITHUB_RELEASES.md`](docs/GITHUB_RELEASES.md) | GitHub Releases and updater publication runbook. |
| [`docs/VALIDATION.md`](docs/VALIDATION.md) | Local validation and packaging commands. |
| [`docs/RELEASE_STATUS.md`](docs/RELEASE_STATUS.md) | Current engineering release evidence and remaining gates. |
| [`docs/LIVE_QUALIFICATION.md`](docs/LIVE_QUALIFICATION.md) | Live protocol qualification checklist. |
| [`docs/ROADMAP.md`](docs/ROADMAP.md) | Forward plan for closing remaining product gaps. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Pull request workflow and code standards. |

---

## License

Aux Command is free and open-source software licensed under **AGPL-3.0-or-later**. Every feature belongs in the public build; there are no enterprise-only modules, paid editions, or payment walls.

Third-party components retain their own licenses; see [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`THIRD_PARTY_LICENSES.txt`](THIRD_PARTY_LICENSES.txt).
