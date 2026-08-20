# Aux Command — Product Roadmap

Aux Command's goal: the best Linux-native remote-operations workstation, measured
against MobaXterm for feature reach but built around safety, privacy, and speed.

Statuses: **shipped** · **in progress** · **planned** · **decision needed**

## Phase 1 — Smart Terminal Assist *(shipped)*

A globally toggleable assistance layer for every terminal session, with each
part switchable on its own from the Assist panel.

| Feature | Status | Notes |
|---|---|---|
| OS / distro detection | shipped | Passive detection from session output (os-release, MOTD, banners, prompts); local shells read the host directly. Tab badge shows Fedora/Debian/Ubuntu/macOS/Windows/BSD. No probe commands are ever injected. |
| Inline command suggestions | shipped | Ghost suggestions from in-memory session history plus a per-OS command dictionary (`apt` vs `dnf` vs `brew` vs `winget` aware). Accept with Ctrl+Space. History is kept in memory only — never written to disk. |
| Autocorrect ("did you mean") | shipped | Detects `command not found` responses and offers a corrected command as an insert-only chip. Never auto-runs anything. |
| Dangerous-command guard | shipped | Confirms before transmitting Enter on destructive commands (`rm -rf /`, `dd of=/dev/…`, `mkfs`, firewall flush, fork bomb, shutdown/reboot). |

## Phase 2 — Ops multipliers *(planned)*

| Feature | Status | Notes |
|---|---|---|
| Cross-session history search | planned | Ctrl+R-style overlay across all open sessions, filterable by host; inserts, never executes. |
| Multi-host command runner | planned | Select open sessions → run one command on all → per-host collected output table. Builds on Broadcast. |
| Per-host quick dashboard | planned | CPU/RAM/disk/uptime chips in the tab header, extending Live Monitor probes. |
| Session recording & replay | planned | Timing-aware recording on top of existing transcripts, with an asciinema-style replay viewer. |
| Drag-and-drop upload into SFTP panel | planned | Uses the existing `sftp:upload-paths` path. |

## Phase 3 — Reach *(decision needed)*

| Feature | Status | Notes |
|---|---|---|
| Windows / macOS builds | decision needed | Biggest audience multiplier; needs per-OS PTY bridge work and CI runners for both platforms. |
| Optional AI command assist | decision needed | Natural language → command, explain-this-error. Strictly off by default and bring-your-own endpoint (local llama.cpp or user-supplied key). No bundled cloud dependency. |
| UI localization | planned | The 8 README languages already exist; extend to the app UI. |

## Shipped foundation (v0.3.0)

SSH / Mosh / Telnet / FTP / FTPS / serial / RDP / VNC / local shells · embedded
noVNC + FreeRDP · graphical SFTP with transfer queue · tunnels · network tools
(ping, traceroute, DNS, port scan, whois, Wake-on-LAN) · SSH key manager · live
server monitor · remote desktop gateway · profile sync · session persistence ·
broadcast input · snippets · command palette · macros · transcripts + logging ·
14 terminal themes · encrypted credential vault · auto-updates via GitHub Releases.
