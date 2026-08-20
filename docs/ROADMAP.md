# Aux Command release roadmap

> The live product roadmap with current feature statuses is
> [`ROADMAP.md`](../ROADMAP.md) at the repository root. This document is the
> versioned release plan.

Aux Command is a free, open-source public product. Every feature in this roadmap targets the public build; there are no paid tiers, enterprise-only packs, or payment walls.

## 0.1 - operational foundation

- Linux desktop shell and Auxillo visual identity.
- Native PTY terminal tabs.
- Local shell, SSH, Mosh, bundled Telnet and bundled serial sessions.
- SSH profile manager and `~/.ssh/config` import.
- Graphical SFTP browser with upload, download, mkdir, rename and delete.
- SCP fallback transfer mode for SSH profiles on constrained legacy servers without SFTP.
- FTP and FTPS file-browser profiles with explicit insecure-transport warning for plain FTP.
- Local, remote and dynamic OpenSSH tunnels.
- External FreeRDP and TigerVNC launchers.
- Secure SFTP credential vault and host-key verification.
- Command snippets manager.
- Active terminal transcript printing.
- Guarded macro recording and replay through command snippets.
- Drag-and-drop SFTP uploads.
- Active-session terminal transcript export with local review/copy/save/print controls.
- Explicit per-session terminal logging to a local operator-selected file.
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

## 0.2 - daily-driver terminal polish (shipped in the 0.2.x line)

- Persistent workspace layouts (tiled/single view and pane sizes survive restart).
- Resumable SFTP/FTP transfer queue with pause, resume, retry, cancel and clear-completed.
- Per-session terminal logging with explicit operator opt-in, plus transcript export.
- Session persistence and reconnect across app restarts.
- Network tools panel (ping, traceroute, DNS, port scan, whois, Wake-on-LAN).

## 0.3 - integrated remote desktop

- Embedded VNC (bundled noVNC bridge) and embedded RDP (FreeRDP rendered on a
  headless Xvfb display exported through x11vnc) both ship as in-app tabs, with
  automatic fallback to the native FreeRDP/TigerVNC clients when the embedded
  toolchain is unavailable.
- Certificate/fingerprint management.
- Multi-monitor controls, audio and drive redirection policy.
- Remote desktop session recording controls where legally permitted.
- Deeper RDP/VNC settings for clipboard, geometry, console/admin mode, certificate/fingerprint handling, drive/device redirection policy, and multi-monitor behavior.
- SSH-gateway assisted RDP/VNC/Telnet workflows where the protocol can be safely wrapped through OpenSSH forwarding.

## 0.4 - workspace power and protocol parity

- Global terminal appearance presets and import/exportable workspace-level defaults.
- Per-profile tiled-pane defaults.
- Terminal output logging presets for operator-selected local directories.
- Detached terminal windows and fullscreen terminal workspace mode.
- Additional FTP/FTPS TLS policy controls.
- Deeper SCP workflow polish, including explicit remote-path download prompts and broader legacy-server qualification.
- Optional XDMCP/remote Unix desktop workflows using a Linux-appropriate design rather than copying Windows-specific embedded X-server behavior.
- Host X11/Xwayland/Xephyr/Xpra workflow management for remote graphical Unix applications.
- Legacy Rlogin/RSH only if explicitly justified by real user demand and guarded as insecure legacy transport.

## 0.5 - team operations

- Optional end-to-end encrypted profile synchronization.
- Role-based shared connection collections.
- Audit events without command or credential capture.
- Organization policy for forwarding, legacy protocols and exports.
- Shared-session sources over local files, HTTPS, FTP/FTPS, and SSH/SFTP where safe and authenticated.
- Public customizer/policy profile generation for organizations that want branded defaults, disabled unsafe protocols, or preloaded public connection templates.
- Embedded local server manager for controlled TFTP, HTTP, FTP, SSH/SFTP, and Telnet test daemons with bind-address controls, audit logs, and safe lifecycle cleanup.

## 1.0 - production release

- Signed packages and reproducible release pipeline.
- Automatic update channel with signed update verification.
- Published GitHub Release generated from CI for every production tag.
- Ubuntu, Debian, Fedora, openSUSE and Arch qualification matrix.
- Accessibility review, localization and crash-recovery testing.
- Independent security assessment and remediation.
