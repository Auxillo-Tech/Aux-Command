# Aux Command

Aux Command is an Auxillo-branded Linux remote-operations workstation for SSH, SFTP, tunnels, RDP, VNC, Mosh, Telnet, serial consoles and local shells.

This repository is a working **0.1 engineering release**, not a finished one-to-one replacement for every MobaXterm feature. It provides the complete core architecture and primary workflows needed to run and extend the product without copying MobaXterm code or branding.

## What works

- Real PTY-backed terminal tabs using xterm.js and a bundled Python 3 PTY bridge.
- Native OpenSSH sessions with SSH agent, `~/.ssh/config`, identities, ProxyJump, compression, keepalives, X11 forwarding and agent forwarding.
- Quick connect for SSH, Mosh, Telnet, RDP and VNC.
- Persistent connection profiles, favorites, groups, search, import/export and SSH-config import.
- Graphical SFTP browser with host-key verification, keyboard-interactive authentication, upload, download, folder creation, rename and delete.
- Separate SFTP account-password or encrypted-key-passphrase storage through the Linux desktop secret service; unsafe `basic_text` storage is rejected.
- Local, remote and dynamic OpenSSH tunnels with live status and stop controls.
- FreeRDP and TigerVNC launchers.
- Mosh sessions, plus bundled Python 3 Telnet bridge and bundled Python 3 raw serial bridge sessions.
- Host-tool diagnostics and Linux package build targets.

## Requirements

- A current x64 or arm64 Linux desktop.
- Node.js 22 or newer and npm for source builds.
- Python 3 for the bundled PTY, Telnet and raw serial bridges. No native Node module compilation is required.
- OpenSSH client for SSH and tunnels.
- Optional: Mosh, FreeRDP and TigerVNC for protocols that intentionally launch external clients.
- A desktop secret service such as GNOME Keyring or KWallet for persistent SFTP credentials.

Install optional host tools on supported distributions:

```bash
./scripts/install-runtime-tools.sh
```

## Run from source

```bash
./scripts/bootstrap.sh
npm start
```

Development mode opens Electron DevTools:

```bash
npm run dev
```

## Validate

```bash
npm run check
```

The validation command checks JavaScript, Python and shell syntax, then runs the Node test suite, including real PTY integration tests.

## Build Linux packages

```bash
npm run dist
```

Artifacts are generated under `dist/` as AppImage, `.deb` and `.rpm` packages for the configured architectures. Build each architecture on matching hardware or a correctly configured cross-build environment.

For the current x64 Linux release build, use:

```bash
npm run dist:x64
```

On Fedora hosts without `libcrypt.so.1` or `rpmbuild`, this script downloads the required Fedora build-tool compatibility packages into the local ignored `.cache/` directory and does not require sudo or modify the system package set.

## Keyboard controls

| Shortcut | Action |
|---|---|
| `Ctrl+K` | Focus quick connect |
| `Ctrl+Shift+T` | Open local terminal |
| `Ctrl+Shift+F` | Toggle SFTP |
| `Ctrl+W` | Close active tab |
| `Ctrl+Shift+C` | Copy terminal selection |
| `Ctrl+Shift+V` | Paste into terminal |

Right-click copies the selected terminal text; with no selection it pastes clipboard text.

## Security behavior

Terminal SSH sessions are native OpenSSH processes. Aux Command does not capture or store their password/MFA prompts. Profile exports exclude credential identifiers and secret material.

The graphical SFTP client has its own explicit known-host fingerprint store. This is separate from OpenSSH's `known_hosts`, so the first SFTP connection can require a second trust decision.

Managed tunnels run in OpenSSH BatchMode and require key or SSH-agent authentication. This avoids invisible password prompts in a background process.

See [docs/SECURITY.md](docs/SECURITY.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/RELEASE_STATUS.md](docs/RELEASE_STATUS.md).

## Current limitations

- RDP and VNC launch native Linux clients rather than rendering inside an Aux Command tab.
- The terminal does not yet provide session recording.
- SFTP supports one explicit ProxyJump hop through OpenSSH; complex chains and all `ssh_config` directives are not yet modeled by the graphical client.
- Background tunnels cannot satisfy interactive passwords or MFA.
- Packages are not yet code-signed, auto-updated or qualified across a production distro matrix.
- Telnet and some VNC configurations are unencrypted legacy protocols.

The implementation sequence for closing these gaps is documented in [docs/ROADMAP.md](docs/ROADMAP.md). Exact handoff and validation status is recorded in [docs/RELEASE_STATUS.md](docs/RELEASE_STATUS.md).

## Data location

Application data is stored beneath Electron's `userData` location, normally:

```text
~/.config/Aux Command/aux-command-data/
```

## License

Copyright © Auxillo. All rights reserved. This source release is proprietary unless Auxillo publishes a different license in writing. Third-party components retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
