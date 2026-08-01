# Changelog

## Unreleased

### Changed

- Redesigned the entire workspace around a professional layout: application tools moved from the crowded top strip into a dedicated left icon rail with crisp vector icons and tooltips, so no control is ever cut off at any window width.
- Rebuilt the visual design system — typography scale, spacing, focus rings, refined dark glass surfaces, modal/palette/menu treatments, and consistent hover/active states across every panel.
- Adopted the Aux Command product logo across the in-app brand mark, welcome screen, and all packaged Linux application icons; the Auxillo company wordmark now links to auxillo.tech from the header, and the status bar carries a persistent auxillo.tech link.
- The session tab bar and toolbar now appear only once a session exists, keeping the welcome screen clean.

### Added

- Added an embedded RDP tab: FreeRDP renders into a headless Xvfb display exported through x11vnc and streamed into the app via the bundled noVNC bridge, with automatic fallback to the native FreeRDP client when Xvfb/x11vnc/FreeRDP are not installed. Diagnostics reports which mode is active.
- Added `~/.ssh/config` `Include` directive parsing (globs, nesting, and cycle protection) so hosts split across included files are imported.
- Added multi-hop ProxyJump chains (`bastion,user@inner:2222`) across SSH terminals, tunnels, and graphical SFTP, replacing the previous single-hop limit.
- Added a per-connection context menu (also on right-click) with Connect, Edit, Duplicate, Add/Remove favorite, Move to group, and a discoverable Delete with confirmation.
- Added sidebar group management: create groups from the sidebar, rename or delete groups from their own menu, collapse/expand groups, per-group "new connection here", and a group picker with suggestions in the connection editor. Custom groups persist across restarts.

- Added a per-profile OpenSSH known-hosts override field to the connection editor for isolated lab and fixture hosts.
- Added an RDP domain field to the remote desktop gateway dialog, passed to FreeRDP as `/d:`.
- Added transfer queue quality-of-life: a live active-transfer count badge, queue hydration from the main process on startup and reload, and a clear-completed control.
- Added support for arbitrary Linux serial baud rates (for example 250000 or 1000000) through the `termios2`/`BOTHER` interface, with clear errors when the driver rejects a rate.

### Fixed

- Serial and Telnet sessions now switch their PTY to raw mode: keystrokes including Ctrl+C reach the device or server as bytes, input is no longer line-buffered, and passwords are no longer locally echoed.
- Large pastes no longer crash terminal, serial, or telnet sessions: bridge writes are buffered with backpressure instead of dying on non-blocking write errors.
- Telnet option negotiation now survives commands split across TCP segment boundaries via a stateful IAC parser, and socket sends are queued under backpressure.
- Serial and Telnet bridge helper files are packaged world-readable so root-owned deb/rpm installs can start those sessions.
- Workspace Ctrl+Shift shortcuts (palette, snippets, layout, broadcast, duplicate, reconnect, pane sizing, file browser) now work while a terminal has keyboard focus, the advertised Ctrl+W closes a tab after its session exits, and Escape closes modals even when a field has focus.
- FTP/FTPS disconnects now reach the FTP service: the preload bridge no longer drops the protocol argument, and profile save/delete pass it through.
- The FTP/FTPS file browser is no longer disconnected or replaced when terminal tabs are opened or activated; it now closes only through its own panel controls.
- FTP operations for a profile are serialized on the control connection so browsing during a queued transfer no longer kills either operation; dead cached FTP connections are re-established instead of failing until manual disconnect, and connects racing a profile edit no longer resolve with stale settings.
- FTP directory listings show real permissions instead of dashes, and inline FTP text saves are atomic (upload to `.part`, then rename).
- All 14 terminal themes offered by the profile editor are accepted by validation; previously saving with 11 of them rejected the whole profile.
- SCP fallback downloads no longer fail on distributions where `/tmp` is a separate filesystem; uploads write to a remote `.part` path and move into place; the fallback now requires an already-trusted host key and explains how to trust one instead of silently accepting unknown keys.
- Stopping a tunnel now reports `stopped` instead of `failed` with SSH debug output.
- Closed-session transcripts are bounded and released when their tab closes instead of accumulating until app quit.
- Update checks no longer hang at “Checking…” on deb/rpm installs where the embedded updater is inactive.
- Profile synchronization no longer duplicates profiles on every cycle when remote entries have unnamed or whitespace-padded names, validates the whole payload before applying anything, and refreshes the sidebar after background syncs.
- An inactive embedded VNC tab no longer covers terminal panes in single view; VNC bridge sessions are stopped during renderer crash recovery; running a snippet on a VNC tab reports an error instead of a false success.
- Cancelled transfers disappear from the queue UI, and cancelling a paused or failed transfer cleans up partial files.
- One invalid profile or snippet entry in `profiles.json` no longer breaks startup — it is skipped with a warning; array-rooted store files are quarantined like other corruption.
- Network diagnostics return partial output when a command times out, the live monitor honors its shorter connect timeout, and Mosh sessions honor the per-profile known-hosts override.
- SFTP keyboard activation opens the focused row instead of the previous selection; profile-sync modal buttons enable after the first save; diagnostics refresh replaces the dialog instead of stacking; snippet delete, SSH-key copy/delete, and gateway stop surface errors instead of failing silently.
- Remote text editing stages downloads in private 0700 temp directories, and the PTY bridge no longer leaks its IPC descriptors into user sessions.

### Documentation

- Removed third-party product comparisons; the project now documents its own scope on its own terms.
- Realigned roadmap documents with what the 0.2.x line actually shipped.

## 0.2.3 - 2026-07-29

This section consolidates the 0.2.x release line.

### Documentation

- Declared Aux Command as a free/open-source AGPL-3.0-or-later public product with no enterprise-only features, paid editions, or payment walls.
- Rebuilt the GitHub-facing README into a professional product overview covering purpose, operating system support, install paths, feature areas, security model, build commands, validation status, and documentation map.
- Added `INSTALL.md` with AppImage, Debian/Ubuntu, Fedora/RHEL/Rocky/AlmaLinux, openSUSE, Arch-family, source-build, verification, and troubleshooting guidance.
- Corrected release and architecture documentation to state the current Linux x86_64 package scope and GitHub repository readiness accurately.
- Documented the public GitHub release trust path (GPG-signed manifests/checksums) and optional platform attestations.

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
