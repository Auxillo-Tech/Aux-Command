# Installing Aux Command

Aux Command currently ships as a Linux desktop application for x86_64 and, from 0.5.0, ARM64 (aarch64).

Supported package outputs for the 0.3.x release line:

```text
Aux-Command-<version>-x86_64.AppImage
Aux-Command-<version>-amd64.deb
Aux-Command-<version>-x86_64.rpm
```

The same three formats for ARM64 (aarch64) machines:

```text
Aux-Command-<version>-arm64.AppImage
Aux-Command-<version>-arm64.deb
Aux-Command-<version>-aarch64.rpm
```

Pick the files that match your processor (`uname -m` prints `x86_64` or `aarch64`) and use the ARM64 file names in the commands below. The ARM64 packages are built and tested on GitHub's ARM64 runners; they have not yet been verified on physical ARM64 desktops, so treat them as a preview and report what you find. In-app updates always fetch the package for the processor the application is running on.

No Windows or macOS release package is currently produced.

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
chmod +x Aux-Command-0.5.0-x86_64.AppImage
./Aux-Command-0.5.0-x86_64.AppImage
```

If your system does not support AppImage FUSE mounting:

```bash
./Aux-Command-0.5.0-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

Optional desktop integration can be handled by your desktop environment or an AppImage manager. Do not run AppImage installers from untrusted locations.

---

## Ubuntu installation

Tested target family: Ubuntu LTS x86_64.

```bash
sudo apt install ./Aux-Command-0.5.0-amd64.deb
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
sudo apt install ./Aux-Command-0.5.0-amd64.deb
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
sudo dnf install ./Aux-Command-0.5.0-x86_64.rpm
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
sudo dnf install ./Aux-Command-0.5.0-x86_64.rpm
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
sudo zypper install ./Aux-Command-0.5.0-x86_64.rpm
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

Build ARM64 packages without publishing, on an ARM64 machine or as a cross-build on x86_64 (no cross compiler is needed: the ARM64 packages contain no compiled Node modules):

```bash
npm run dist:arm64 -- --publish never
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

## Updating

Use **Updates** in the application (status bar or command palette), then **Check for updates**, **Download update** and **Restart and install**.

- **AppImage:** the application replaces its own file after checking it against the signed release manifest. The previous version is kept for **Restore previous version**.
- **deb and rpm:** the application downloads the package for your install, checks its size and SHA-256 against the signed release manifest, and installs it through your desktop's administrator prompt (`pkexec`), then restarts. You type your password once; no terminal is needed. The prompt runs only the update helper that the package installs at `/usr/lib/aux-command/update-helper` (root-owned, with the polkit action `tech.auxillo.command.install-update`), and that helper installs nothing that is not the signed, newer Aux Command package: it never downgrades. If `pkexec` is not installed, or the helper is missing, install the new package with your package manager as before.

Every update is verified against the OpenPGP-signed manifest with the release signing key bundled in the application before anything is installed.

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
./Aux-Command-0.5.0-x86_64.AppImage --appimage-extract
./squashfs-root/AppRun
```

If extraction mode works, the host likely lacks AppImage FUSE support.

### RDP, VNC, or Mosh buttons report missing tools

Install the optional runtime tools for your distribution. Aux Command does not bundle FreeRDP, TigerVNC, or Mosh.

### Persistent SFTP credentials are unavailable

Aux Command refuses to persist secrets if Electron reports an unsafe Linux `basic_text` storage backend. Install and unlock a desktop secret service such as GNOME Keyring or KWallet, or use memory-only credentials for the session.

### Background SSH tunnels fail immediately

Managed tunnels sign in with the password or key passphrase saved in the profile, and show a dialog for anything else OpenSSH asks (a password that is not saved, a one-time code, an unknown host key). A tunnel that still fails immediately was refused by the server or the dialog was cancelled; the tunnel's error line says which. The saved credential is used with OpenSSH 8.7 or later on this computer (`ssh -V`). With OpenSSH 8.4 to 8.6 it is not used and the dialog asks for it each time, because those versions cannot tell their own password question from text sent by a server. Versions older than 8.4 ignore the setting that redirects prompts and can only use SSH keys or an unlocked SSH agent. A server that offers only keyboard-interactive login (PAM with `PasswordAuthentication no`) is asked about on the terminal or in a dialog instead of being answered from the saved credential: its question arrives as `(user@host) Password:`, text the server wrote, and an app that answered it could hand your password to a server or jump host that imitates the prompt. That is intended, not a fault.
