# Changelog

## Unreleased

### Documentation

- Declared Aux Command as a free/open-source AGPL-3.0-or-later public product with no enterprise-only features, paid editions, or payment walls.
- Rebuilt the GitHub-facing README into a professional product overview covering purpose, operating system support, install paths, feature areas, security model, build commands, validation status, and documentation map.
- Added `INSTALL.md` with AppImage, Debian/Ubuntu, Fedora/RHEL/Rocky/AlmaLinux, openSUSE, Arch-family, source-build, verification, and troubleshooting guidance.
- Corrected release and architecture documentation to state the current Linux x86_64 package scope and GitHub repository readiness accurately.
- Documented the current private-repository GitHub limitations for branch protection and artifact attestations.

### Added

- Added active-session terminal transcript export with bounded main-process transcript capture and a renderer review/copy/save/print modal.
- Added explicit per-session terminal logging with a renderer Log/Stop log control, local save dialog, bounded transcript backfill, and mode `0600` log files.
- Added guarded terminal macro recording that requires a secret-capture warning and saves reviewed input as replayable snippets.
- Added graphical SFTP drag-and-drop upload with preload path resolution and main-process absolute-path validation.
- Added FTP and FTPS file-browser profiles through `basic-ftp`, with an explicit insecure-transport warning before opening plain FTP.
- Added explicit SCP fallback transfer mode for SSH profiles on constrained legacy servers, with local OpenSSH fixture coverage for upload/download and a clear no-directory-browsing boundary.
- Added per-profile terminal appearance controls for theme, font stack, font size, cursor style, cursor blink, and scrollback depth.
- Added Serial to Quick Connect with `/dev/...` device-path handling.
- Added an advanced per-profile OpenSSH known-hosts-file override for isolated lab/fixture profiles.
- Added a top-level Updates toolbar control for GitHub release update checks, downloads, and install restart.
- Added inline graphical SFTP UTF-8 text file editing with live OpenSSH fixture coverage and remote overwrite via POSIX rename when supported.
- Added persistent workstation layout settings so tiled/single layout and pane size toolbar choices survive app restart.
- Replaced the temporary app mark with the supplied Auxillo gradient logo across renderer branding and Linux package icons.

### Fixed

- Prevented global terminal shortcuts from firing while operators type in Quick Connect, profile search, SFTP path, or other editable fields.
- Improved keyboard focus handling for non-closeable SSH trust/authentication prompts so focus lands on visible controls, not hidden close buttons.
- Added command-palette combobox/listbox/option ARIA state and explicit icon-button labels for better keyboard and assistive-technology behavior.
- Fixed graphical SFTP remote text replacement so overwriting existing files uses OpenSSH POSIX rename where available instead of failing on non-overwriting SFTP rename behavior.

## 0.1.0 - 2026-07-22

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
