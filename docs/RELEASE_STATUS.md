# Release validation status

Validated: **6 October 2026**, Linux x86_64.

The published release used in the updater test is **v0.4.0**. Current fixes are on a development branch and packaged as an **unpublished 0.4.1 test candidate**. A candidate build does not publish a release or update existing installations.

## Import and recovery additions

SSH imports now show progress, completion counts and errors in dialogs. Profile JSON imports preview explicit merge/update/copy choices. Workspace backups include preferences and layout; local recovery points and a restore journal protect against accidental imports and interrupted restores. Update recovery keeps a checksum-verified previous AppImage and attempts restoration after a synchronous installer failure. Connection exits now include stage-specific guidance without copying terminal contents into diagnostic messages.

The source CI workflows now run protocol, import/recovery UI, keyboard/high-DPI and session-soak checks, plus installer checks in Debian 12, Ubuntu 24.04 and Fedora 44 containers. Tagged release publication requires the signing secret. Workflow configuration has been checked locally; GitHub-hosted results require pushing the branch.

## Confirmed fixes

- Process cleanup reaps adopted descendants and terminates guarded process trees.
- SSH import refreshes effective OpenSSH settings, preserves personal profile settings, and recognizes consolidated aliases.
- Proxied SSH reachability no longer reports a misleading direct TCP failure.
- Electron asynchronous credential decryption returns the actual password string.
- Linux packages declare missing Electron runtime libraries.
- The updater verifies downloaded AppImage bytes against the GPG-signed manifest, rechecks them before installation, and prevents overlapping update operations. Unsolicited download events cannot authorize installation; authentication response sizes are bounded while streaming.
- FTP replacement preserves the original through a backup and attempts rollback if replacement fails. If rollback fails, the error identifies the retained original file.
- Partial FTP downloads have private permissions from creation. Resumed files cannot retain stale trailing bytes. Cancelled queued transfers do not start data transfer, and the inline editor stops at its byte limit.
- Embedded RDP remembers server certificates and rejects changes instead of ignoring certificate validation.

## Evidence

- `npm run check`: **280 passed, 0 failed, 0 skipped**.
- Full `npm audit`: **0 reported vulnerabilities**.
- Actual signed public-release check, AppImage download and installer replacement in an isolated directory using the real electron-updater implementation. Installation handoff is intercepted to avoid opening a normal desktop session; packaged launch is tested separately.
- FTP and implicit FTPS: listing, upload/download, editing, rename/remove, reconnect, cancellation and TLS hostname rejection against disposable loopback servers.
- Mosh startup command and actual data transfer through local, remote and SOCKS SSH tunnels against a disposable OpenSSH server.
- RDP TLS connection through FreeRDP, virtual display and VNC bridge: client window, RFB handshake/framebuffer update, cleanup and changed-certificate rejection.
- SSH/SFTP/SCP, Telnet and simulated serial flows in the automated suite.
- Keyring unavailability and decryption failures preserve existing encrypted credentials; malformed JSON files are quarantined and failed persistence does not replace in-memory state.
- Debian 12 and Fedora 44 installer upgrades preserve profile/vault fixture files and resolve required runtime libraries.
- Real GNOME keyring upgrade from the published 0.4.0 app preserves encrypted credentials, profile settings and remembered SSH host keys.
- Packaged AppImage desktop smoke covers renderer startup, local terminals, layout, command palette, reconnect, snippets, diagnostics and updates UI.

## Remaining field qualification

Controlled fixtures do not establish universal interoperability. Still needed: Windows RDP/domain environments, representative NAT/jump-host networks, physical serial unplug/reconnect, real screen-reader use, and broader Wayland, high-DPI and multi-monitor environments. This is not a claim of production 1.0 certification.

## Reproduction and publication

See [VALIDATION.md](VALIDATION.md) for commands and [LIVE_QUALIFICATION.md](LIVE_QUALIFICATION.md) for field coverage. Test fixtures use temporary profiles, keys and loopback servers; personal infrastructure is not part of application defaults or installer contents.

Before publication, use the existing [GitHub release runbook](GITHUB_RELEASES.md), set the intended release version, build and sign the final artifacts, and verify them with the pinned release signing fingerprint. The development candidates are not signed public releases.
