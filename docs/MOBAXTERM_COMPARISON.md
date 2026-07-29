# Aux Command vs MobaXterm — Feature Comparison

## Executive Summary

Aux Command is a **native Linux** remote operations workstation. It is not a MobaXterm clone — it is an original product that fills the gap MobaXterm left by being Windows-only. Where MobaXterm embeds an X server and Windows-native SSH, Aux Command leverages native Linux tools (OpenSSH, FreeRDP, TigerVNC) through a polished Electron interface.

## Feature Comparison Table

| Feature | MobaXterm | Aux Command | Notes |
|---------|-----------|-------------|-------|
| **SSH terminal** | ✅ Built-in | ✅ OpenSSH-based | Both use native SSH; Aux uses system OpenSSH |
| **SFTP browser** | ✅ Built-in | ✅ Built-in (ssh2) | Aux has drag-drop uploads, text editing |
| **FTP/FTPS** | ✅ Built-in | ✅ Built-in (basic-ftp) | Both support |
| **SCP fallback** | ✅ | ✅ Per-profile | Aux: explicit SCP mode for legacy servers |
| **Telnet** | ✅ Built-in | ✅ Bundled Python bridge | Aux doesn't need host telnet binary |
| **Serial console** | ✅ Built-in | ✅ Bundled Python bridge | Aux doesn't need picocom/minicom |
| **RDP** | ✅ Embedded tab | ✅ External FreeRDP | Roadmap: embedded (v0.3) |
| **VNC** | ✅ Embedded tab | ✅ External TigerVNC | Roadmap: embedded (v0.3) |
| **Mosh** | ❌ | ✅ External client | Aux supports Mosh natively |
| **SSH tunnels** | ✅ Built-in | ✅ Built-in | Local/remote/dynamic all supported |
| **X11 forwarding** | ✅ Embedded X server | ✅ OpenSSH -X | Aux uses host X/Wayland |
| **Command snippets** | ✅ | ✅ Macro recording + library | Aux records input, strips ANSI |
| **Multi-exec (broadcast)** | ✅ | ✅ With safety confirmation | Aux requires explicit danger confirmation |
| **Session tabs** | ✅ | ✅ Tiled + single view | Aux supports resizable tiled layout |
| **Session logging** | ✅ | ✅ Per-session logging | Aux: file mode 0600, transcript export |
| **Session export** | ✅ | ✅ Transcript copy/save/print | Aux has full modal review UI |
| **Find in terminal** | ✅ | ✅ xterm search addon | Aux has ↑↓ navigation |
| **Command palette** | ❌ | ✅ Full palette | Ctrl+Shift+P for actions/profiles/snippets |
| **Credentials vault** | ✅ | ✅ Encrypted storage | Aux: KDE Wallet/Secret Service, memory fallback |
| **Host key verification** | ✅ | ✅ Separate SSH+SFTP stores | Aux detects changed keys vs first-seen |
| **Profile import/export** | ✅ | ✅ JSON + SSH config import | Aux: credentials never exported |
| **SSH config import** | ✅ | ✅ Full parser | Aux handles ProxyJump, IdentityFile, etc. |
| **Drag-drop upload** | ✅ | ✅ SFTP drag-drop | Aux resolves local paths via preload |
| **Macro recording** | ✅ | ✅ Guarded macro recording | Aux: privacy warning, ANSI stripping |
| **Scripting/automation** | ✅ | ✅ Snippet system | Aux: run snippets to active terminal |
| **Multiple themes** | ✅ | ✅ 3 themes | Aux-dark, light, high-contrast |
| **Per-profile terminal config** | ✅ | ✅ Font/theme/cursor/scrollback | Aux per-profile appearance settings |
| **Portable/AppImage** | ✅ (portable EXE) | ✅ AppImage/DEB/RPM | Aux: native Linux packages |
| **Embedded X server** | ✅ Cygwin X | ❌ Uses host X/Wayland | Different architecture; not applicable on Linux |
| **Windows-only** | ✅ | ❌ | Aux is Linux native; no plan for Windows/macOS |
| **Open source** | ❌ (proprietary) | ✅ AGPL-3.0 | Aux is 100% free/open source with no paid tiers |

## What Aux Command Has That MobaXterm Doesn't

1. **Command palette** — Ctrl+Shift+P for keyboard-driven action search
2. **Broadcast input with named warnings** — Lists which terminals will receive input
3. **Bundled Telnet/serial bridges** — No dependency on system telnet or picocom
4. **Encrypted credential vault** — KDE Wallet/Secret Service integration
5. **Transcript review UI** — Full copy/save/print modal before export
6. **Resizable tiled layout** — Proper tiling with min/max constraints
7. **Native Linux packaging** — AppImage, .deb, .rpm
8. **No Cygwin dependency** — Uses system OpenSSH directly
9. **FIPS-compliant SSH** — Uses system OpenSSH with its security policies

## What MobaXterm Has That Aux Command Is Missing

| Missing Feature | Priority | Roadmap | Workaround |
|-----------------|----------|---------|------------|
| **Embedded RDP/VNC** | Medium | v0.3 | External FreeRDP/TigerVNC (functional) |
| **Text editor** | Low | v0.4 | Inline SFTP UTF-8 editing exists |
| **Session persistence across restarts** | Low | v0.2 | Manual save/restore planned |
| **SSH gateway for RDP/VNC** | Medium | v0.3 | Manual ProxyJump setup |
| **XDMCP** | Low | v0.4 | Use native X application |
| **Rlogin/RSH** | Very low | v0.4 | Insecure; only if demanded |
| **Team/shared profiles** | Medium | v0.5 | JSON import/export for now |
| **Audit logging** | Medium | v0.5 | Terminal logging exists per-session |
| **Macro replay (not recording)** | Low | v0.2 | Snippet system covers this |
| **SFTP queue with pause/resume** | Low | v0.2 | Sequential upload only |
| **World clock/network tools** | Low | v0.5 | Use snippet commands |
| **Built-in TFTP/HTTP servers** | Very low | v0.5 | Use system tools |
| **Custom scripts integration** | Low | v0.3 | Snippet system covers this |

## Key Architectural Differences

### Security Model
- **MobaXterm**: Single EXE, runs as user, limited sandboxing
- **Aux Command**: Electron with sandbox, context isolation, strict CSP, main-frame IPC validation

### Process Model
- **MobaXterm**: Embedded Cygwin processes
- **Aux Command**: Native Linux processes (OpenSSH, Python bridges), spawned with argument arrays (no shell interpolation)

### Credential Handling
- **MobaXterm**: Stores in encrypted profile, no OS integration
- **Aux Command**: Optional OS credential store (KDE Wallet), rejects basic_text encryption, interactive SSH auth stays in PTY

## Build Artifacts

| Artifact | Size | Notes |
|----------|------|-------|
| AppImage | ~125 MB | Self-contained, portable |
| Debian | ~98 MB | .deb for Debian/Ubuntu |
| RPM | ~86 MB | .rpm for Fedora/RHEL |

## Test Results (0.2.3)

- **Unit tests**: 127/127 ✅
- **CDP E2E smoke**: All 10 sections pass ✅
- **Syntax checks**: 62 files validated ✅
- **npm audit**: 0 vulnerabilities ✅
- **AppImage test**: Built and smoke-tested ✅
