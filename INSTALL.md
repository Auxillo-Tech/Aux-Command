# Installing Aux Command

Aux Command currently ships as a Linux x86_64 desktop application.

Supported package outputs for the 0.3.x release line:

```text
Aux-Command-<version>-x86_64.AppImage
Aux-Command-<version>-amd64.deb
Aux-Command-<version>-x86_64.rpm
```

No Windows, macOS, or ARM64 release package is currently produced.

---

## Choose the right package

| System | Recommended package | Alternative |
|---|---|---|
| Fedora Workstation / Fedora KDE | `.rpm` | AppImage |
| Ubuntu LTS | `.deb` | AppImage |
| Debian 12+ | `.deb` | AppImage |
| RHEL / Rocky / AlmaLinux | `.rpm` | AppImage |
| openSUSE | `.rpm` | AppImage |
| Arch / EndeavourOS / Manjaro | AppImage | Source build |
| Other modern x86_64 Linux desktops | AppImage | Source build |

Use the native package when you want the application registered in the desktop menu and package database. Use AppImage when you want a portable, non-invasive install.

---

## Core runtime dependencies

Aux Command packages declare the core runtime dependencies needed for the main operating paths:

- Python 3;
- OpenSSH client.

The application also uses bundled Python helper scripts for:

- PTY-backed local shell sessions;
- Telnet terminal sessions;
- raw serial terminal sessions;
- process lifecycle guarding.

Optional protocol clients are installed separately when those workflows are needed:

| Workflow | Required external package |
|---|---|
| Mosh | `mosh` |
| RDP | FreeRDP / `xfreerdp` |
| VNC | TigerVNC / `vncviewer` |
| X11 forwarding | OpenSSH plus local X11/Xwayland environment |

Install optional tools with the bundled helper:

```bash
./scripts/install-runtime-tools.sh
```

The helper supports `apt-get`, `dnf`, `pacman`, and `zypper` based distributions.

---

## AppImage installation

Best for portable use or distributions without a native package.

```bash
chmod +x Aux-Command-0.3.0-x86_64.AppImage
./Aux-Command-0.3.0-x86_64.AppImage
```

If your system does not support AppImage FUSE mounting:

```bash
./Aux-Command-0.3.0-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

Optional desktop integration can be handled by your desktop environment or an AppImage manager. Do not run AppImage installers from untrusted locations.

---

## Ubuntu installation

Tested target family: Ubuntu LTS x86_64.

```bash
sudo apt install ./Aux-Command-0.3.0-amd64.deb
aux-command
```

Optional tools:

```bash
sudo apt update
sudo apt install python3 openssh-client mosh freerdp3-x11 tigervnc-viewer
```

If `freerdp3-x11` is unavailable on your Ubuntu release, use `freerdp2-x11`.

---

## Debian installation

Expected target family: Debian 12+ x86_64.

```bash
sudo apt install ./Aux-Command-0.3.0-amd64.deb
aux-command
```

Optional tools:

```bash
sudo apt update
sudo apt install python3 openssh-client mosh freerdp2-x11 tigervnc-viewer
```

---

## Fedora installation

Primary engineering target family: Fedora x86_64.

```bash
sudo dnf install ./Aux-Command-0.3.0-x86_64.rpm
aux-command
```

Optional tools:

```bash
sudo dnf install python3 openssh-clients mosh freerdp tigervnc
```

---

## RHEL / Rocky / AlmaLinux installation

Expected target family: modern RHEL-compatible x86_64 desktop deployments.

```bash
sudo dnf install ./Aux-Command-0.3.0-x86_64.rpm
aux-command
```

Optional tools:

```bash
sudo dnf install python3 openssh-clients mosh freerdp tigervnc
```

Some enterprise images may require enabling the appropriate desktop, EPEL, or optional repositories for Mosh, FreeRDP, or TigerVNC.

---

## openSUSE installation

Expected target family: openSUSE Leap/Tumbleweed x86_64.

```bash
sudo zypper install ./Aux-Command-0.3.0-x86_64.rpm
aux-command
```

Optional tools:

```bash
sudo zypper install python3 openssh-clients mosh freerdp tigervnc
```

---

## Arch / EndeavourOS / Manjaro installation

Install from the AUR (see [`packaging/aur/`](packaging/aur/)):

```bash
# Binary package built from the released AppImage:
yay -S aux-command-bin
# …or build from a tagged source checkout:
yay -S aux-command
```

Or use the AppImage, or run from source.

Optional tools for the full feature set:

```bash
sudo pacman -Sy --needed python openssh mosh freerdp tigervnc xorg-server-xvfb x11vnc whois bind
```

---

## Flatpak installation

A Flatpak manifest is provided in [`packaging/flatpak/`](packaging/flatpak/)
and targets Flathub. To build and install locally:

```bash
flatpak install -y flathub org.freedesktop.Sdk//23.08 \
  org.freedesktop.Platform//23.08 org.electronjs.Electron2.BaseApp//23.08
flatpak-builder --user --install --force-clean build-dir \
  packaging/flatpak/tech.auxillo.command.yml
flatpak run tech.auxillo.command
```

The sandbox is scoped to `~/.ssh`, downloads, host filesystem (for transfers),
serial devices, and the Secret Service / KWallet credential store.

---

## Run from source

Requirements:

- Linux x86_64 desktop;
- Node.js 22 or newer;
- npm;
- Python 3;
- OpenSSH client.

Install dependencies and start:

```bash
./scripts/bootstrap.sh
npm start
```

Development mode:

```bash
npm run dev
```

Validate source:

```bash
npm run check
```

Build local x86_64 packages without publishing:

```bash
npm run dist:x64 -- --publish never
```

---

## Verify release files

Every release should include:

```text
SHA256SUMS
release-manifest.json
aux-command-<version>-sbom.cdx.json
```

Verify checksums after downloading artifacts:

```bash
sha256sum -c SHA256SUMS
```

For unsigned engineering releases, checksums detect corruption but do not authenticate publisher identity. A fully authenticated public release requires an Auxillo-controlled signing key and documented signature verification.

---

## Troubleshooting

### `aux-command: command not found`

Confirm the native package installed successfully:

```bash
rpm -q aux-command
# or
apt list --installed | grep aux-command
```

For AppImage usage, run the AppImage path directly.

### AppImage does not start

Try extraction mode:

```bash
./Aux-Command-0.3.0-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

If extraction mode works, the host likely lacks AppImage FUSE support.

### RDP, VNC, or Mosh buttons report missing tools

Install the optional runtime tools for your distribution. Aux Command does not bundle FreeRDP, TigerVNC, or Mosh.

### Persistent SFTP credentials are unavailable

Aux Command refuses to persist secrets if Electron reports an unsafe Linux `basic_text` storage backend. Install and unlock a desktop secret service such as GNOME Keyring or KWallet, or use memory-only credentials for the session.

### Background SSH tunnels fail immediately

Managed tunnels run OpenSSH in `BatchMode=yes`. Use SSH keys or an unlocked SSH agent. Interactive password/MFA prompts cannot be completed invisibly in a background tunnel process.
