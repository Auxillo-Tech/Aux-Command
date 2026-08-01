# Aux Command — Ultimate Software Roadmap

## Tier 1: High Impact, Fast to Build

### 1. Built-in Network Tools Panel
The most-used remote-operations capability after terminals. A sidebar panel with:
- **Ping** — visual ping with latency graph
- **Traceroute** — show hop-by-hop with IP + latency  
- **DNS lookup** — A/AAAA/MX/TXT/NS lookup with one click
- **Port scan** — scan common ports on a host
- **Whois** — domain/IP whois lookup
- **Wake-on-LAN** — send magic packet to a host

All run as child processes (ping, traceroute, dig, nc, whois) with output captured and formatted in a clean UI panel. No external dependencies — uses standard Linux tools.

### 2. Remote Desktop Gateway / Tunnel Wizard
Visual SSH tunnel builder for routing RDP/VNC through jump hosts:
- "I want to RDP to 10.0.0.50:3389 via my bastion" — single click
- Auto-creates SSH local forward, launches FreeRDP pointing at local port
- Manages tunnel lifecycle (auto-stop when RDP closes)
- Bookmark gateway configurations

### 3. Terminal Themes Gallery
Expand from 3 themes to 15+:
- Import/export themes as JSON
- Community theme presets (Nord, Dracula, Solarized, One Dark, Catppuccin, Tokyo Night, etc.)
- Per-profile theme preview in profile editor
- Terminal preview in theme selector

## Tier 2: Medium Impact, New Capabilities

### 4. SSH Key Manager
Built-in SSH key operations without leaving the app:
- Generate ed25519/RSA key pairs
- Copy public key to clipboard
- Display public key fingerprint
- Manage ~/.ssh/authorized_keys on remote hosts
- SSH agent status (keys loaded, add key)

### 5. Live System Monitor Tab
Active tab type showing real-time host metrics:
- CPU usage graph (from /proc/stat or ssh top -b)
- Memory usage (free -m)
- Disk usage (df -h)
- Network I/O (from /proc/net/dev)
- Process list (top -b -n1)
- Updates via SSH command polling every 2-5 seconds

### 6. Bulk File Operations
Enhance SFTP with:
- Select multiple files, download as ZIP/TAR
- Upload entire directories
- File search on remote host (grep -r)
- Sync local directory to remote (rsync mode)

## Tier 3: Define the Category

### 7. Embedded RDP Viewer
Full RDP inside an app tab using:
- xfreerdp3 piped to a canvas via GDI backend
- Keyboard/mouse forwarding
- Clipboard sync
- Audio forwarding

### 8. Session Automation Engine
Beyond snippets — actual automation:
- Expect-like: "wait for 'password:', send 'mypass'"
- Scheduled commands: "run 'apt update && apt upgrade -y' every Monday 3am"
- Multi-host: "run this command on all 10 servers"
- Output aggregation: "show me the results from all hosts"

### 9. Team Sync Server
Dedicated lightweight sync server for team profiles:
- Node.js HTTP server (~200 lines)
- Profile sharing with version history
- Conflict resolution UI
- LDAP/OIDC auth integration

### 10. X11 Application Launcher
Make remote GUI apps first-class:
- "Connect to host → run 'xclock'" = launches X11 app in local window
- Caches app list from remote
- Favorites for common remote apps
- Desktop file integration

---

## Implementation Order (Recommended)

| Sprint | Features | Est. Effort |
|--------|----------|-------------|
| **v0.3.1** | Network tools panel + Theme gallery | 3-4 hours |
| **v0.3.2** | Remote Desktop Gateway + SSH Key Manager | 3-4 hours |
| **v0.3.3** | Live system monitor + Bulk file ops | 4-5 hours |
| **v0.4** | Session automation engine | 6-8 hours |
| **v0.5** | Embedded RDP + Team sync server | 8-12 hours |
| **v1.0** | X11 launcher, polish, signing | 4-6 hours |

## Delivery status

The Network Tools panel, Remote Desktop Gateway, SSH Key Manager, and Live
system monitor from Tier 1 are shipped in the current 0.2.x line. The
remaining items above stay on the roadmap in priority order.
