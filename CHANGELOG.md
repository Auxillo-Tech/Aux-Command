# Changelog

## 0.1.0 — 2026-07-22

Initial Aux Command engineering release.

### Added

- Auxillo-branded Linux desktop interface with profile groups, favorites, search, quick connect, tabs, diagnostics and keyboard shortcuts.
- Real PTY-backed local, SSH, Mosh, Telnet and serial terminals through a bundled Python 3 bridge.
- Native OpenSSH integration for agent authentication, `~/.ssh/config`, ProxyJump, keepalives, compression, X11 forwarding, agent forwarding and startup commands.
- Graphical SFTP browser with explicit host-key trust, password or key-passphrase authentication, keyboard-interactive prompts and file operations.
- Local, remote and dynamic OpenSSH tunnel management.
- Native FreeRDP and TigerVNC launchers.
- Encrypted SFTP credential storage with insecure Linux `basic_text` persistence rejected.
- Safe profile import/export and SSH-config import.
- AppImage, Debian and RPM build configuration plus a GitHub Actions x64 build workflow.

### Security and reliability

- Sandboxed renderer, context isolation, strict CSP, main-frame IPC authorization and no renderer Node.js access.
- Direct argument-array process spawning; no profile input is interpolated into a local shell.
- Atomic restrictive-permission stores with rollback-safe in-memory state.
- Credential-type separation so a private-key passphrase is not offered as an account password.
- Connection-signature invalidation for edited SFTP profiles.
- Race-safe tunnel and SFTP connection lifecycle handling.
- Packaged-ASAR resolution for the external Python PTY helper.

### Known limitations

See `README.md` and `docs/ROADMAP.md`. This release is an operational foundation, not complete feature parity with every mature remote-administration suite.
