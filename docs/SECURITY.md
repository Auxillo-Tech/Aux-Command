# Security model and reporting

Aux Command is security-sensitive software. Treat every renderer value, imported profile and remote filename as untrusted.

## Implemented controls

- Electron renderer sandbox enabled.
- `contextIsolation` enabled and Node integration disabled.
- Strict local Content Security Policy. App pages are served from a private `app://aux` origin with an allowlist of the app's own files, not from `file://`, and the `grantFileProtocolExtraPrivileges` fuse is off, so `'self'` cannot match arbitrary files on disk.
- External window creation and renderer navigation denied.
- Single, frozen preload API.
- IPC sender validation on every handler.
- Direct process spawning without a command shell; Mosh’s required SSH command string is assembled from individually POSIX-quoted arguments.
- Structured validation for profiles, ports, paths and tunnels.
- Atomic profile/vault/known-host writes with restrictive permissions.
- Explicit SFTP host-key verification.
- Linux `basic_text` safeStorage backend rejected.
- Secrets omitted from profile exports and renderer state.
- Persistent secrets decrypted only when an SFTP connection is initiated. Passwords and private-key passphrases are typed separately so a passphrase is never offered as account-password authentication.
- OpenSSH and Mosh arguments end option parsing (`--`) before the host, and startup commands may not start with `-`, so a profile field can never become a local `ssh`/`mosh` option such as `-oProxyCommand`.
- Clipboard text is sanitized before it reaches a terminal: escape and control characters are removed so an embedded end-of-paste marker cannot run commands, and multi-line or broadcast pastes are confirmed first (configurable in Settings).
- Automatic terminal replies (device attributes, cursor and colour reports, mouse reports) bypass the command mirror, macros and broadcast. The dangerous-command guard checks every committed line. It is a safety net, not a security boundary.
- AI assist replies are inserted without control characters and never executed. Remote AI endpoints must use HTTPS; plain HTTP is accepted only for `localhost`. Replies are size-limited.
- Web links in terminal output (plain URLs and OSC 8 hyperlinks) open only on Ctrl+click and only for `http`/`https`.
- The embedded VNC/RDP viewer is served from its own `aux-vnc://viewer` origin, so noVNC cannot reach the workspace's preload API. The local VNC bridge accepts only that origin plus a single-use token.
- Embedded RDP runs its virtual X display with a private MIT-MAGIC-COOKIE, and x11vnc listens only on a Unix socket in a `0700` directory, so other local users cannot watch or control the session.
- Profile synchronization shares connection names, hosts, ports, users, groups and tags only. Startup commands, keys, jump hosts, known-hosts files and agent/X11 forwarding stay local; local-shell profiles are never synchronized; plain HTTP sources are allowed only on `localhost`, and redirects cannot change the scheme.
- Workspace backups list every startup command before a restore.
- Input typed at password prompts, or while the terminal does not echo, is never displayed by the assist bar, suggested, stored in history or recorded into macros.
- SFTP host keys are checked against Aux Command's own trust store and OpenSSH `known_hosts`; keys marked `@revoked` are refused and a key that differs from OpenSSH's is shown as changed.
- Executables are looked up only in absolute `PATH` directories.

## Important trust boundaries

The host OpenSSH configuration, SSH agent, private keys, FreeRDP, TigerVNC and Mosh installations are outside the Aux Command trust boundary. Keep these packages patched through the Linux distribution. Telnet and serial forwarding run through bundled Python 3 Telnet bridge and bundled Python 3 raw serial bridge helpers, but the remote endpoint or device remains outside Aux Command's trust boundary.

X11 forwarding and SSH agent forwarding expand the remote host's ability to interact with local resources. They are disabled by default and should be enabled only for trusted servers.

Telnet and VNC can be unencrypted depending on deployment. Prefer SSH, RDP with verified certificates, or a VPN where possible.

RDP uses trust on first use: FreeRDP records the server certificate on the first connection and rejects a changed certificate afterwards, but the first connection is not interactively confirmed. For sensitive hosts, connect first from a trusted network or check the recorded fingerprint in `~/.config/freerdp/`.

## Reporting

Do not open a public issue for a vulnerability that could expose credentials or remote systems. Send a private report through the contact channel listed at auxillo.tech with reproduction steps, affected version, impact and suggested mitigation.
