# Third-party notices

Aux Command is free, open-source software licensed under AGPL-3.0-or-later. Its own terms are in `LICENSE`.

Aux Command bundles the following direct npm runtime components:

- `@novnc/novnc` - MPL-2.0 License
- `@xterm/xterm` - MIT License
- `@xterm/addon-fit` - MIT License
- `@xterm/addon-search` - MIT License
- `basic-ftp` - MIT License
- `electron-updater` - MIT License
- `openpgp` - LGPL-3.0 License
- `ssh2` - MIT License
- `ws` - MIT License

Aux Command bundles the following typefaces, each licensed under the
SIL Open Font License 1.1 (full text in `THIRD_PARTY_LICENSES.txt`):

- Inter — Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
- JetBrains Mono — Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)

Their production transitive dependencies are also bundled. The complete,
versioned license texts for every package in the production dependency graph
are provided in `THIRD_PARTY_LICENSES.txt`. A machine-readable CycloneDX SBOM
is published beside each release as `aux-command-<version>-sbom.cdx.json`.

Electron and Chromium license notices are supplied separately by the Electron
runtime in `LICENSE.electron.txt` and `LICENSES.chromium.html`.

Aux Command includes original Python PTY, Telnet, and serial bridge code as part
of the application, licensed under the same AGPL-3.0-or-later terms. Python 3 is
supplied by the operating system.
OpenSSH, Mosh, FreeRDP, and TigerVNC clients are optional or required external
system packages as documented for each protocol; they are not bundled into Aux
Command and remain subject to their distributors' licenses.
