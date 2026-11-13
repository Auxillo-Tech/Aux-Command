# Saved SSH credentials and the OpenSSH version gate

A password or key passphrase saved in a connection profile is handed to OpenSSH through its askpass mechanism (a private per-process socket), never on a command line or in an environment variable. How far that goes depends on the OpenSSH client installed on the computer (`ssh -V`).

| OpenSSH client | What happens |
| --- | --- |
| Below 8.4 | `SSH_ASKPASS_REQUIRE` does not exist. Terminals are untouched and background processes (tunnels, live monitor, remote-desktop gateway) keep `BatchMode`: use SSH keys or an agent. |
| 8.4 to 8.6 | Prompts are redirected to dialogs, but the saved credential is never released. Every prompt goes to the user. |
| 8.7 or later | The saved credential answers OpenSSH's own password and key passphrase prompts for the profile, once. Everything else still goes to the user. |

## Servers that only offer keyboard-interactive sign-in

A server that allows only keyboard-interactive login (PAM with `PasswordAuthentication no`) never receives the saved password. The terminal asks you on the terminal and tunnels ask in a dialog. That is intended: OpenSSH prints such a question as `(user@host) Password:`, text the server wrote, and answering it from the vault could hand your password to a server or jump host that imitates the prompt.

## Why the gate is 8.7

The saved credential is only safe when OpenSSH marks text sent by a server, which it does by showing server prompts as `(user@host) text`. That prefix arrived in OpenSSH 8.5. The gate is 8.7 for 0.5.0 by decision, and real clients have now been run to check it.

`scripts/qualify-ssh-version-gate.sh` builds OpenSSH 8.4p1, 8.5p1, 8.6p1 and 8.7p1 from the official source tarballs (sha256 pinned, release signature checked when `gpg` is installed) in a memory- and CPU-limited container, then runs the application's real `AskpassPolicy` and `createAskpassSession` as a non-root user with no network except loopback, against two servers:

- a normal server (password, or public key with a passphrase-protected key), which shows OpenSSH's own prompts;
- a hostile server that offers only keyboard-interactive and sends prompts worded exactly like OpenSSH's own password prompt (`user@host's password: `, `Password: `) and passphrase prompt (`Enter passphrase for key '...': `).

Required result, printed as one `VERDICT` line per version (a version that cannot be built or run is printed as `NOT RUN`, never as passed):

- 8.4, 8.5, 8.6: the vault is read 0 times, the server never receives the saved secret and the user gets a dialog.
- 8.7: the saved secret answers only OpenSSH's own prompt and never a prompt worded by the server.

The probe also runs the same servers with the gate switched off. Those lines are information only. Recorded on 13 November 2026 with the image `node:22-bullseye` (OpenSSL 1.1.1w):

- 8.4p1: the server-worded prompts were answered with the saved secret (the gate is what protects 8.4).
- 8.5p1, 8.6p1, 8.7p1: server-worded prompts were not answered; OpenSSH's own prompts were.

So 8.5 and 8.6 look safe for a later release. Only those four builds and that one kind of server were run: not OpenSSH 9.x, and not distribution builds with backported patches. Lowering the gate means changing `SAVED_CREDENTIAL_VERSION` in `src/main/lib/ssh-askpass.cjs` and `REQUIRED_SAVED_FROM` in `scripts/ssh-version-gate-probe.cjs` together, re-running the script and updating the table above. The probe fails when the two disagree.

### Running it

Docker, `curl`, `sha256sum` and network access (tarballs, `npm ci`) are needed. It is not part of `npm run check`.

```sh
AUX_SSH_GATE_WORK=/path/to/scratch scripts/qualify-ssh-version-gate.sh
# one version only: scripts/qualify-ssh-version-gate.sh --versions "8.7p1"
```

Exit status is 0 when every version passed, 1 when one failed and 2 when a version was not run.
