# Aux Command distribution packaging

This directory holds the packaging that reaches Linux users beyond the GitHub
release page: a Flatpak (for Flathub) and two AUR packages (for Arch users).
The AppImage, `.deb` and `.rpm` files still come from `npm run dist:x64`; the
packages here wrap or rebuild those. Nothing in this directory is published
yet. Publishing needs the maintainer's own Flathub and AUR accounts.

All three packages share the desktop entry and metainfo in `flatpak/` and the
icons in `build/icons/`, so the branding is the same everywhere.

## What is pinned today, and what changes at 0.5.0

The committed files point at the latest published release (v0.4.0), because
that is the only release whose download URL and SHA-256 can be checked today.
The from-source AUR package follows the source tag (v0.5.0).

When v0.5.0 is published on GitHub, change exactly these values:

1. `flatpak/tech.auxillo.command.yml`: the `url` (v0.4.0 and 0.4.0 become
   v0.5.0 and 0.5.0) and the `sha256` of `Aux-Command-0.5.0-x86_64.AppImage`.
   Also the three screenshot URLs in the metainfo (`v0.4.0` becomes `v0.5.0`),
   unless the screenshots have not changed.
2. `flatpak/tech.auxillo.command.metainfo.xml`: on the `0.5.0` release entry,
   remove `type="development"` and set the real publication date. Until then
   the entry is marked as a development release and its date is a stand-in, so
   nothing presents 0.5.0 as published.
3. `aur/aux-command-bin/PKGBUILD`: `pkgver=0.5.0` and `sha256sums` of the same
   AppImage.
4. `aur/aux-command/PKGBUILD`: nothing, unless the tag name changes. It builds
   from the `v${pkgver}` tag and uses `sha256sums=('SKIP')` because git
   sources have no fixed hash (the tag is the pin).

Get the hash with `sha256sum Aux-Command-0.5.0-x86_64.AppImage` or from
`node scripts/release-manifest.cjs`. Never point either package at a moving
`latest` URL.

## Flatpak

`flatpak/tech.auxillo.command.yml` unpacks the released AppImage on top of
`org.electronjs.Electron2.BaseApp` (branch 26.08, freedesktop runtime 26.08)
and starts it through `zypak-wrapper`, so Chromium keeps its own sandbox inside
the Flatpak sandbox. No Node or Electron toolchain is needed to build it.

Sandbox permissions, each with its reason:

- `--share=network`: every connection type needs it.
- `--share=ipc`, `--socket=wayland`, `--socket=fallback-x11`: the window.
- `--talk-name=org.freedesktop.secrets`: the credential vault (Electron
  safeStorage uses the desktop Secret Service).
- `--device=all`: serial consoles open TTY devices.
- `--filesystem=~/.ssh` and `--socket=ssh-auth`: SSH config, keys,
  `known_hosts` and the agent.
- `--filesystem=xdg-download`: the default transfer folder. Everything else
  goes through the file chooser portal.

Inside the sandbox SSH, SFTP, FTP, tunnels, Telnet and serial work. RDP, VNC,
Mosh and the whois/dig/ping tools need programs the Flatpak runtime does not
ship, so they are limited (the metainfo says so). Do not widen the sandbox to
make them work; Flathub reviewers will object.

Local build and install, from the repository root:

```bash
flatpak install -y flathub org.freedesktop.Sdk//26.08 \
  org.freedesktop.Platform//26.08 org.electronjs.Electron2.BaseApp//26.08
flatpak-builder --user --install --force-clean build-dir \
  packaging/flatpak/tech.auxillo.command.yml
flatpak run tech.auxillo.command
```

Checks to run before every submission:

```bash
flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest packaging/flatpak/tech.auxillo.command.yml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder appstream packaging/flatpak/tech.auxillo.command.metainfo.xml
flatpak run --command=flatpak-builder-lint org.flatpak.Builder repo repo-dir
appstreamcli validate --pedantic packaging/flatpak/tech.auxillo.command.metainfo.xml
desktop-file-validate packaging/flatpak/tech.auxillo.command.desktop
```

`repo` reports two screenshot errors on a local build
(`appstream-external-screenshot-url`, `appstream-screenshots-not-mirrored-in-ostree`).
Flathub's build service mirrors the screenshots itself, so these are expected
locally and clear on Flathub.

The updater needs no change for Flatpak: the in-app updater only offers a
one-click install on `.deb` and `.rpm` installs and on AppImages. In a Flatpak
there is no `rpm`, no `dpkg-query` and no `APPIMAGE` variable, so it shows the
"updates through your package manager" message and Flatpak updates the app.

## AUR

Two packages under `aur/`:

- `aux-command-bin` repackages the released AppImage (unpacked, no FUSE). No
  build toolchain needed.
- `aux-command` builds the tagged source with `electron-builder`
  (`npm run pack`), runs `npm run check`, and installs the unpacked tree.
  It uses Node 22 (`nodejs-lts-jod`), the version the project is tested with,
  and passes `--dangerously-allow-all-scripts` to `npm ci` because Arch's npm 12
  skips install scripts by default and the native modules (`cpu-features`,
  `ssh2`) need theirs. The lockfile pins every dependency.

Both depend on `openssh`, `python` and the system libraries the bundled
Electron needs (`gtk3`, `nss`, `alsa-lib` and so on). FreeRDP, TigerVNC, Xvfb,
x11vnc, Mosh, whois and bind are `optdepends`. The packages conflict with each
other. `chrome-sandbox` is installed setuid root, as Chromium needs.

The updater needs no change for the AUR either: the installed program is not
owned by an rpm or dpkg database (even when `dpkg` is installed on Arch,
`dpkg-query -S` does not claim it), neither package installs the deb/rpm update
helper or its polkit policy, and the program is not started from an AppImage,
so the app reports that updates come through the package manager.

Checks: `makepkg -f`, `namcap PKGBUILD`, `namcap *.pkg.tar.zst`, then install
and start the program.

Publishing (maintainer's own AUR account and SSH key):

```bash
cd packaging/aur/aux-command-bin      # then repeat for aux-command
makepkg -si                            # local test build and install
makepkg --printsrcinfo > .SRCINFO      # AUR metadata for this exact pkgver
git clone ssh://aur@aur.archlinux.org/aux-command-bin.git ../aur-repo
cp PKGBUILD .SRCINFO ../aur-repo/
cd ../aur-repo && git add PKGBUILD .SRCINFO && git commit -m "aux-command-bin 0.5.0" && git push
```

`.SRCINFO` is generated at publish time and is not committed here, because it
must match the exact `pkgver` and hashes of the AUR push.
