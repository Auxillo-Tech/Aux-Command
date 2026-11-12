#!/usr/bin/env bash
set -euo pipefail
node scripts/test-mosh-tunnels.cjs
node scripts/test-sftp-signin.cjs
xvfb-run -a node scripts/test-rdp-vnc.cjs
xvfb-run -a node scripts/test-rdp-signin.cjs
node scripts/test-ftp.cjs
