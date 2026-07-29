# Security Policy

Aux Command is security-sensitive remote-operations software. Do not publish vulnerabilities that could expose credentials, private infrastructure, remote hosts, tunnels, or user session data.

## Supported versions

| Version | Status |
|---|---|
| 0.2.x | Active |

## Reporting a vulnerability

Report privately to [security@auxillo.tech](mailto:security@auxillo.tech) or through the contact path at https://auxillo.tech.

Include, when safe:

- affected version or commit;
- operating system and package format;
- reproduction steps;
- security impact;
- whether credentials, host keys, profile exports, tunnels, or remote files are involved;
- suggested mitigation if known.

Do not include real passwords, private keys, production host secrets, or customer data. Use a local fixture or redacted evidence wherever possible.

## Security model

The detailed security model is maintained in [`docs/SECURITY.md`](docs/SECURITY.md).
