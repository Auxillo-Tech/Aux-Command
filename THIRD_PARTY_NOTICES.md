# Third-party notices

Aux Command is proprietary software. Its own terms are in `LICENSE`.

Aux Command bundles the following direct npm runtime components:

- `@xterm/xterm` — MIT License
- `@xterm/addon-fit` — MIT License
- `@xterm/addon-search` — MIT License
- `ssh2` — MIT License

Their production transitive dependencies are also bundled. The complete,
versioned license texts for every package in the production dependency graph
are provided in `THIRD_PARTY_LICENSES.txt`. A machine-readable CycloneDX SBOM
is published beside each release as `aux-command-<version>-sbom.cdx.json`.

Electron and Chromium license notices are supplied separately by the Electron
runtime in `LICENSE.electron.txt` and `LICENSES.chromium.html`.

Aux Command includes original Python PTY, Telnet, and serial bridge code as part
of the proprietary application. Python 3 is supplied by the operating system.
OpenSSH, Mosh, FreeRDP, and TigerVNC clients are optional or required external
system packages as documented for each protocol; they are not bundled into Aux
Command and remain subject to their distributors' licenses.
