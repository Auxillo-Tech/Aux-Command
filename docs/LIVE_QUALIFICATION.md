# Live protocol qualification checklist

This checklist tracks the gap between automated local fixture coverage and production-like field qualification.

## Already covered by automated local tests

- Local PTY terminal lifecycle.
- Local sshd fixture for SSH terminal and graphical SFTP flows.
- Loopback TCP fixture for bundled Telnet bridge.
- Socat PTY fixture for bundled serial bridge.
- OpenSSH argument construction for local, remote, and dynamic tunnels.
- Mosh command construction.
- External RDP/VNC launcher argument construction.
- Packaged AppImage CDP smoke for local terminal, snippets, tiled layout, broadcast input, command palette, reconnect, and diagnostics. Screenshot capture is diagnostic-only because compositor/CDP timing can hang after the functional smoke has already passed.

## Still required before public production claims

| Area | Required live evidence | Status |
|---|---|---|
| SSH terminal | Connect to at least one representative non-local Linux host, run command, resize terminal, disconnect cleanly | Not qualified |
| SFTP | List/upload/download/mkdir/rename/delete against representative SSH host with password and key auth cases | Not qualified |
| Host-key verification | First-seen accept, persisted key reuse, changed-key warning/reject against controlled host-key rotation | Not qualified |
| Local tunnel | Open local forward to reachable service, prove listener exists, prove traffic reaches target, stop tunnel cleanly | Not qualified |
| Remote tunnel | Open remote forward on controlled host, prove remote listener/traffic, stop tunnel cleanly | Not qualified |
| SOCKS tunnel | Open dynamic tunnel, prove SOCKS traffic through it, stop tunnel cleanly | Not qualified |
| Mosh | Connect to representative host with `mosh` installed locally and `mosh-server` remotely | Not qualified |
| X11 forwarding | Launch simple X11 client over SSH with Xwayland/X11 display available | Not qualified |
| RDP | Launch FreeRDP against representative test server and verify success/failure handling | Not qualified |
| VNC | Launch VNC viewer against representative test server and verify success/failure handling | Not qualified |
| Physical serial | Connect to real USB serial device, send/receive data, unplug/reconnect behavior | Not qualified |
| Assistive tech | Orca/screen-reader pass over connection list, terminal tablist, modals, diagnostics, SFTP panel | Not qualified |
| Desktop matrix | Fedora/Ubuntu already sampled; Debian, openSUSE, Arch, GNOME/KDE/XFCE, Wayland/X11, high-DPI, multi-monitor remain | Partially qualified |

## Evidence standard

For each completed row, capture:

1. Host/distro/client versions.
2. Exact test profile shape without secrets.
3. Expected behavior.
4. Actual result.
5. Screenshot or log snippet with secrets redacted.
6. Cleanup result.
7. Any regression test added afterward.
