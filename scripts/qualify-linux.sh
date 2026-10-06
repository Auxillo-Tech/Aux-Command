#!/usr/bin/env bash
set -euo pipefail
node scripts/test-mosh-tunnels.cjs
xvfb-run -a node scripts/test-rdp-vnc.cjs
node scripts/test-ftp.cjs
