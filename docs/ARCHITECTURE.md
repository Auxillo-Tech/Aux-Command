# Aux Command architecture

## Product boundary

Aux Command is an original Linux remote-operations workstation built from free and open components. It does not include, copy, or depend on any third-party proprietary code, assets, protocols, or branding.

The application intentionally delegates mature network behavior to native Linux clients where that produces better interoperability:

- OpenSSH handles interactive SSH terminals and managed tunnels.
- `ssh2` provides the graphical SFTP channel and explicit host-key verification.
- FreeRDP and TigerVNC provide desktop protocol clients at the external-client boundary.
- Mosh remains an external client because it requires the host `mosh` client and a compatible remote `mosh-server`.
- Telnet runs through a bundled Python 3 Telnet bridge, and serial consoles run through a bundled Python 3 raw serial bridge.
- xterm.js renders terminal sessions. Bundled Python 3 helpers provide local PTY, Telnet and serial transports without native Electron add-ons.

## Process model

### Main process

The Electron main process owns all privileged operations:

- profile persistence;
- credential encryption and retrieval;
- process spawning;
- PTY lifecycle;
- SFTP networking and filesystem dialogs;
- OpenSSH tunnel lifecycle;
- host-tool diagnostics;
- clipboard and external-link access.

IPC handlers verify that every request originated from the single Aux Command renderer. Inputs are normalized before reaching process-spawning or filesystem APIs.

### Preload bridge

The sandboxed preload exposes a narrow, frozen API. The renderer has no Node.js integration and cannot access the filesystem or spawn processes directly.

### Renderer

The renderer owns presentation state only: profile lists, terminal tabs, modals, SFTP rows, tunnel status, and keyboard interaction. Dynamic content is inserted with `textContent`/DOM nodes rather than untrusted HTML.

## Persistent state

The application stores data below Electron's Linux `userData` directory, normally:

```text
~/.config/Aux Command/aux-command-data/
```

Files include:

- `profiles.json` - connection settings and snippets;
- `known-hosts.json` - host fingerprints accepted by the graphical SFTP client;
- `vault.json` - encrypted credential blobs only when a secure desktop secret-service backend is available.

Files are written atomically and restricted to mode `0600` where the filesystem supports POSIX permissions.

## Credential model

Interactive terminal SSH sessions are native OpenSSH processes. Passwords and MFA prompts remain inside the PTY and are not intercepted or stored by Aux Command.

The optional credential vault is used only for graphical SFTP authentication. On Linux, persistent storage is enabled only when Electron safeStorage reports an encryption backend other than `basic_text`. Otherwise the secret is held in memory for the current process and erased on shutdown.

## SSH host verification

OpenSSH terminal sessions use the user's normal OpenSSH host-key policy and `known_hosts` files.

The graphical SFTP implementation maintains a separate fingerprint store because it uses the `ssh2` library. Unknown and changed keys trigger a blocking UI prompt. Changed keys are clearly distinguished from first-seen keys.

## Protocol execution

Executables are discovered from `PATH` with filesystem checks and spawned directly with argument arrays. No profile value is passed through a local shell. Mosh requires an `--ssh=COMMAND` compatibility string; Aux Command constructs it only from individually POSIX-quoted SSH arguments. A saved SSH startup command is passed as one literal OpenSSH remote-command argument, leaving its interpretation to the remote login shell.

Telnet and serial sessions are not delegated to distro `telnet` or `picocom` binaries. They are executed as `python3` plus packaged helper scripts. The Telnet bridge performs defensive option negotiation and raw TCP forwarding; the serial bridge opens the configured absolute device path, applies termios speed/mode settings, and forwards bytes between the terminal and device.

## Remote desktop integration decision

RDP and VNC render as embedded in-app tabs, with the external-client boundary kept as an automatic fallback. VNC streams through the bundled noVNC bridge — a localhost-only WebSocket relay gated by a single-use 32-byte token and a `file://` origin check. RDP reuses that same bridge: FreeRDP renders into a headless `Xvfb` display, `x11vnc` exports that display on a loopback-only ephemeral port, and the noVNC bridge streams it into the renderer. The renderer never speaks the RFB or RDP protocol directly; the iframe is sandboxed and only reaches the tokened localhost WebSocket. When `Xvfb`, `x11vnc`, or FreeRDP are not installed, or the embedded pipeline fails to start, Aux Command falls back to launching the audited, distro-managed FreeRDP/TigerVNC clients with direct argument arrays. This keeps the embedded blast radius confined to loopback while preserving the safe native-client path.

X11 forwarding uses OpenSSH -X and the host X/Wayland Xwayland display. It is a trust-expanding SSH feature, disabled by default, and not an embedded graphical subsystem owned by Aux Command.

Managed tunnels use `ssh -N` with `BatchMode=yes` and `ExitOnForwardFailure=yes`. They therefore require key or SSH-agent authentication and fail rather than hanging on an invisible password prompt.

## Packaging

Electron Builder currently produces AppImage, Debian and RPM artifacts for Linux x86_64. The package declares Python 3 and OpenSSH as runtime dependencies; optional Mosh, FreeRDP and TigerVNC clients remain distribution-managed. Windows, macOS and Linux ARM64 packages are not currently produced.
