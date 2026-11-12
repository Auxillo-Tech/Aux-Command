#!/usr/bin/env bash
set -euo pipefail
node scripts/test-mosh-tunnels.cjs
node scripts/test-sftp-signin.cjs
xvfb-run -a node scripts/test-rdp-vnc.cjs
xvfb-run -a node scripts/test-rdp-signin.cjs
# Electron's TLS library is stricter than Node's; Windows-style certificates must be read inside it.
xvfb-run -a node_modules/electron/dist/electron scripts/test-rdp-certificate-electron.cjs
node scripts/test-ftp.cjs
