# Aux Command release roadmap

## 0.1 — operational foundation

- Linux desktop shell and Auxillo visual identity.
- Native PTY terminal tabs.
- Local shell, SSH, Mosh, bundled Telnet and bundled serial sessions.
- SSH profile manager and `~/.ssh/config` import.
- Graphical SFTP browser with upload, download, mkdir, rename and delete.
- Local, remote and dynamic OpenSSH tunnels.
- External FreeRDP and TigerVNC launchers.
- Secure SFTP credential vault and host-key verification.
- Command snippets manager.
- Terminal search and command palette.
- Session duplication and reconnect policy.
- Tiled multi-session workspace mode.
- Variable-size tiled panes with manual resize handles and pane grow/shrink controls.
- Guarded broadcast input across open terminal sessions.
- Local protocol E2E coverage for SSH terminal, SFTP, Telnet loopback and serial PTY flows.
- Packaged AppImage CDP smoke harness.
- AppImage, Debian and RPM build configuration.
- GitHub Releases update path and release workflow wiring.
- Manual packaged update-check surface in diagnostics.
- Per-profile terminal theme, font, cursor and scrollback settings.
- Serial quick connect for absolute Linux device paths such as `/dev/ttyUSB0`.

## 0.2 — daily-driver terminal polish

- Global terminal appearance presets and import/exportable workspace-level defaults.
- Persistent workspace layouts and per-profile pane defaults.
- Drag-and-drop SFTP and resumable transfer queue.
- SSH config Include parsing and stronger ProxyJump chain support.

## 0.3 — integrated remote desktop

- Embedded RDP and VNC surfaces or a hardened native companion process.
- Until that work is designed and audited, embedded RDP and VNC surfaces remain a 0.3 architecture item; 0.1 intentionally launches native FreeRDP/TigerVNC clients at the external-client boundary.
- Certificate/fingerprint management.
- Multi-monitor controls, audio and drive redirection policy.
- Remote desktop session recording controls where legally permitted.

## 0.4 — team operations

- Optional end-to-end encrypted profile synchronization.
- Role-based shared connection collections.
- Audit events without command or credential capture.
- Organization policy for forwarding, legacy protocols and exports.

## 1.0 — production release

- Signed packages and reproducible release pipeline.
- Automatic update channel with signed update verification.
- Published GitHub Release generated from CI for every production tag.
- Ubuntu, Debian, Fedora, openSUSE and Arch qualification matrix.
- Accessibility review, localization and crash-recovery testing.
- Independent security assessment and remediation.
