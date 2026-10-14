# Changelog

## 0.5.0 - 2026-10-14

### Security

- SSH and Mosh arguments now end option parsing before the host, and startup commands may not start with `-`; previously a crafted startup command such as `-oProxyCommand=…` could run on the local machine.
- Profile sync no longer applies startup commands, identity files, jump hosts, known-hosts files, SSH-config aliases or agent/X11 forwarding from the sync source, never modifies local-shell profiles, allows plain HTTP only for localhost, and refuses redirects that change the scheme.
- Pasted text is stripped of escape and control characters so an embedded end-of-paste marker cannot run commands; multi-line and broadcast pastes are confirmed first (Settings → Copy and paste).
- AI assist refuses replies containing control characters, requires HTTPS for endpoints on other machines, caps reply size and covers the whole request with its timeout.
- The dangerous-command guard checks every committed line, recognises long options and `${HOME}`, no longer flags `rm -rf /tmp/…`, and also confirms dangerous or multi-line snippets. Automatic terminal replies stay out of the guard, macros and broadcast.
- Macro recording captures only the tab being recorded.
- App windows load from a private `app://aux` origin with a file allowlist instead of `file://`, and the `grantFileProtocolExtraPrivileges` fuse is turned off.
- The embedded VNC/RDP viewer is served from an isolated `aux-vnc://viewer` origin and the bridge accepts only that origin. Embedded RDP protects its X display with a private cookie and serves VNC only on a private Unix socket.
- OSC 8 hyperlinks use the same Ctrl+click, http/https-only rule as plain links.
- Workspace backup restores list every startup command first. SSH identity files must be regular files under 64 KB. Executables resolve only from absolute `PATH` entries. The print window runs without JavaScript, and detached windows have no developer tools outside `--dev`.
- The updater verifies downloaded AppImage bytes against the GPG-signed manifest, rechecks them immediately before installation, prevents overlapping update operations, ignores unsolicited download events and bounds authentication response sizes. A checksum-verified previous AppImage is kept for rollback.
- RDP connections (embedded, external window and SSH gateway) show the server certificate's fingerprint for confirmation on first use, like SSH host keys, then pin FreeRDP to that certificate with legacy RDP security disabled. Changed certificates are reported and refused.

### Fixed

- Input typed at password prompts (sudo, ssh, `read -s`) or while the terminal is not echoing is never shown in the assist bar, suggested, saved in command history or recorded into macros.
- Tunnels are reported ready only when no bind failure follows, and failures show the real ssh error instead of the verbose debug log.
- SFTP trusts host keys already in OpenSSH `known_hosts` (plain, hashed, `[host]:port`, wildcards; `@revoked` keys refused) and warns when OpenSSH has a different key; the connection timeout pauses while a trust or password prompt is open, and connection errors are shown once.
- Transcript export, save and print produce plain text without escape codes.
- Remote file and folder names containing `/`, `.`, `..` or control characters are rejected instead of being silently rewritten; a path that cannot be opened keeps the current folder.
- Imported `~/.ssh/config` hosts are resolved from the same config file.
- Dialog translations were reviewed in every language: product, protocol and technical names are no longer translated, computing terms use the right sense, and garbled or truncated sentences are fixed. The tour, live state labels, pane layout options and the remote-desktop viewer now follow the selected language.
- The status bar reports "Session started" rather than "Connected", marks failed exits as errors, and clears informational messages after a while. VNC reports a refused connection instead of "connection lost".
- Network tools keep separate options per tool, reject invalid ports, and show errors without IPC prefixes.
- Multi-host tasks no longer leave marker lines in terminals or shell history.
- Pane − / + always changes the visible layout. The tour only shows steps it can highlight.
- The detached terminal window uses the tab's font, size, colours, scrollback and name.
- Gateway VNC opens the built-in viewer when no native VNC client is installed.
- Saved workspaces leave out quick-connect sessions that cannot be reopened, with a warning.
- The file manager refreshes both sides after a transfer; bulk connection edits are reviewed in plain language with the affected connections listed.
- SFTP panel layout no longer breaks in its empty or error state; long notification text scrolls; setuid/setgid/sticky bits display like `ls`; live monitor output keeps column alignment.
- The connection editor hides options that do not apply to the selected protocol, connection search matches ports and serial devices, the starter "Success" highlight no longer matches inside words, and theme names are readable in Settings.
- Right-click in a terminal no longer selects the word under the pointer and copies it over the clipboard, which made right-click paste impossible over text.
- Ctrl+Shift+V can no longer paste twice: Chromium's native plain-text paste is now suppressed.
- Process cleanup reaps adopted descendants and terminates guarded process trees.
- SSH import refreshes effective OpenSSH settings, preserves personal profile settings, recognizes consolidated aliases, and shows progress, counts and errors.
- Proxied SSH reachability no longer reports a misleading direct TCP failure.
- Asynchronous credential decryption returns the actual password string.
- Linux deb/rpm packages declare the Electron runtime libraries they need.
- FTP replacement keeps a backup and rolls back on failure. Partial downloads are private from creation, resumed files cannot keep stale bytes, cancelled queued transfers never start, and the inline editor respects its byte limit.
- Dialog warnings keep their line breaks and scroll when long.
- Dragging a tab one place to the right no longer leaves it where it was.

### Added

- Linux-style copy and paste in workspace and detached terminals: highlighted text becomes the primary selection and is copied to the clipboard (copy on select, on by default), middle-click pastes the selection, and Ctrl+Insert / Shift+Insert copy and paste.
- A terminal right-click menu with Copy, Paste, Paste selection, Select all, Find, Clear scrollback and a copy-on-select toggle. A PuTTY-style right-click (copy, or paste when nothing is selected) is available in Settings. Mouse-aware programs (tmux, vim, htop) keep their own clicks; Shift overrides.
- Ctrl+click opens http/https links in terminal output in the browser.
- A tab colour per connection (Connection editor → Tab color) marks its tabs and its entry in the connection list, e.g. red for production.
- Ctrl+= / Ctrl+- / Ctrl+0 change the terminal text size (also in pop-out windows); Ctrl+PageUp/PageDown switch tabs and Ctrl+Shift+PageUp/PageDown move the active tab.
- Drag tabs to reorder them, with a drop marker; drop on the empty tab bar to move a tab to the end. Rename tabs in place with a double-click or F2. Remote desktop (RDP/VNC) tabs now support dragging, renaming and the tab menu too.
- Profile JSON import preview with merge/update/copy choices; workspace backups include preferences and layout; local recovery points and a restore journal.
- All/Favorites/Open connection views, multi-term search, Ctrl+Tab session cycling, Ctrl+Shift+E connection search, a wider command palette, density and sidebar preferences, and file-browser filtering, natural sorting and dotfile visibility.
- Resizable panels, terminal maximize and full screen (F11), named saved workspaces, editable Ctrl+Shift shortcuts, and reviewed dual-pane batch transfers with conflict review.
- Recursive folder transfers, SSH working-directory tracking, and translated dialogs.
- File compare and sync reviews, connection organization, movable and detached terminal windows, connection timelines, reusable tasks and remote desktop controls.

### Changed

- CI runs protocol qualification, UI/recovery/soak checks and Debian/Ubuntu/Fedora installer tests; tagged releases refuse to publish without the signing key.
- Dependencies: Electron 43.7.7, basic-ftp 6.2.2, brace-expansion 5.0.12 and a global-agent 4.1.3 override.

## 0.4.0 - 2026-08-20

### Added

- Smart Terminal Assist: passive OS/distro detection with a tab badge, inline command suggestions (Ctrl+Space) from in-memory history and a per-OS dictionary, "did you mean" autocorrect for `command not found`, and a dangerous-command guard that confirms before Enter.
- Cross-session history search (Ctrl+Shift+Y) and a multi-session command runner (Ctrl+Shift+M) with per-session output.
- Session recording and replay with 1×/2×/4×/8×/instant speeds, and live local-host load/memory/disk stats in the status bar.
- Optional bring-your-own-endpoint AI assist (Ctrl+Shift+A), off by default, with the API key stored in the encrypted vault; replies are inserted, never executed.
- Localized interface chrome in nine languages, switchable from the status bar.

### Fixed

- SFTP no longer crashes on late host-trust answers, and trust prompts no longer stack.

### Changed

- Dependency updates to clear npm audit findings (js-yaml 4.3.1, brace-expansion override).

## 0.3.0 - 2026-08-01

### Changed

- Redesigned the entire workspace around a professional layout: application tools moved from the crowded top strip into a dedicated left icon rail with crisp vector icons and tooltips, so no control is ever cut off at any window width.
- Rebuilt the visual design system — typography scale, spacing, focus rings, refined dark glass surfaces, modal/palette/menu treatments, and consistent hover/active states across every panel.
- Adopted the Aux Command product logo across the in-app brand mark, welcome screen, and all packaged Linux application icons; the Auxillo company wordmark now links to auxillo.tech from the header, and the status bar carries a persistent auxillo.tech link.
- The session tab bar and toolbar now appear only once a session exists, keeping the welcome screen clean.

### Added

- Added a first-run guided tour: a spotlight walkthrough of the tool rail, quick connect, groups, command palette, and log highlighting that runs once on first launch and can be replayed from the welcome screen or command palette.
- Added connection health indicators: a background service TCP-probes every saved network connection and shows a reachable/unreachable/checking dot on each sidebar row, refreshed on launch, every 60 seconds, and on demand from the command palette.
- Added a pinned live tunnel status cluster in the status bar that summarizes active SSH tunnels and opens the tunnel manager on click.
- Added terminal keyword highlighting for log triage: user-defined rules color matches in terminal output (plain text or /regex/, case and whole-word options, six colors), with a rules manager, a toolbar toggle, the Ctrl+Shift+H shortcut, a starter rule set, and persistence across restarts. Highlighting is display-only — transcripts, session logs, and exports keep the raw stream — and escape sequences pass through untouched so colored output and full-screen apps are never corrupted.
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

### Packaging

- Added a Flatpak manifest (Flathub-ready, on the Electron base app) with an AppStream metainfo file and desktop entry, plus binary and from-source AUR PKGBUILDs, under `packaging/`. INSTALL.md documents both paths and a metadata test keeps them in sync with the release version.

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
