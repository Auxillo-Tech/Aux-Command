# Aux Command — Product Roadmap

Aux Command's goal: the best Linux-native remote-operations workstation, measured
against MobaXterm for feature reach but built around safety, privacy, and speed.

Statuses: **shipped** · **in progress** · **planned** · **decision needed**

The versioned release plan (0.1 → 1.0) lives in
[`docs/ROADMAP.md`](docs/ROADMAP.md); this document tracks feature status.

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
| Cross-session history search | shipped | Ctrl+Shift+Y overlay across all open sessions, host-tagged, substring-then-fuzzy ranking; inserts, never executes. |
| Multi-host command runner | shipped | Ctrl+Shift+M: select open sessions → run one command on all → per-session collected output, danger guard included. |
| Per-host quick dashboard | shipped | Live local-host load/memory/disk chip in the status bar (20 s refresh from /proc). Remote SSH stats stay on-demand through Live Monitor by design — background per-tab SSH polling would hammer servers. |
| Session recording & replay | shipped | Timing-aware bounded recording per session; "Replay session" in the transcript menu plays it back in a read-only terminal with 1×/2×/4×/8×/instant speeds. |
| Drag-and-drop upload into SFTP panel | shipped | Was already present via `sftp:upload-paths`; verified, no work needed. |

## Phase 3 — Reach *(decision needed)*

| Feature | Status | Notes |
|---|---|---|
| Windows / macOS builds | decision needed | Biggest audience multiplier; needs per-OS PTY bridge work and CI runners for both platforms. |
| Optional AI command assist | shipped | Ctrl+Shift+A: natural language → command and explain-output, strictly off by default, bring-your-own OpenAI-compatible endpoint (llama.cpp, Ollama, or a key). API key lives encrypted in the vault; replies are inserted, never executed. |
| UI localization | shipped (chrome) | All 9 README languages selectable from the status bar; the persistent chrome (top bar, rail, sidebar, toolbar, welcome, tour, SFTP panel, status bar) is fully translated with real plural rules. Deep modal/toast prose remains English pending a full catalog pass. |

## Shipped foundation (v0.3.0)

SSH / Mosh / Telnet / FTP / FTPS / serial / RDP / VNC / local shells · embedded
noVNC + FreeRDP · graphical SFTP with transfer queue · tunnels · network tools
(ping, traceroute, DNS, port scan, whois, Wake-on-LAN) · SSH key manager · live
server monitor · remote desktop gateway · profile sync · session persistence ·
broadcast input · snippets · command palette · macros · transcripts + logging ·
14 terminal themes · encrypted credential vault · auto-updates via GitHub Releases.
