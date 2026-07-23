# Security model and reporting

Aux Command is security-sensitive software. Treat every renderer value, imported profile and remote filename as untrusted.

## Implemented controls

- Electron renderer sandbox enabled.
- `contextIsolation` enabled and Node integration disabled.
- Strict local Content Security Policy.
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

## Important trust boundaries

The host OpenSSH configuration, SSH agent, private keys, FreeRDP, TigerVNC and Mosh installations are outside the Aux Command trust boundary. Keep these packages patched through the Linux distribution. Telnet and serial forwarding run through bundled Python 3 Telnet bridge and bundled Python 3 raw serial bridge helpers, but the remote endpoint or device remains outside Aux Command's trust boundary.

X11 forwarding and SSH agent forwarding expand the remote host's ability to interact with local resources. They are disabled by default and should be enabled only for trusted servers.

Telnet and VNC can be unencrypted depending on deployment. Prefer SSH, RDP with verified certificates, or a VPN where possible.

## Reporting

Do not open a public issue for a vulnerability that could expose credentials or remote systems. Send a private report through the contact channel listed at auxillo.tech with reproduction steps, affected version, impact and suggested mitigation.
