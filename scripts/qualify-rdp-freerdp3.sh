#!/usr/bin/env bash
# Run the RDP qualification against FreeRDP 3 in an Ubuntu 24.04 container.
# FreeRDP 2 and 3 take sign-in details differently, and a host normally has
# only one of them installed, so this covers the version the host does not.
# Needs Docker and an installed node_modules directory (npm ci).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${AUX_RDP_IMAGE:-ubuntu:24.04}"
NODE_VERSION="${AUX_BUILD_NODE_VERSION:-22.23.4}"
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }
[ -d "$ROOT/node_modules" ] || { echo "run npm ci first" >&2; exit 1; }
docker run --rm -e NODE_VERSION="$NODE_VERSION" -v "$ROOT:/src:ro" "$IMAGE" bash -euo pipefail -c '
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq >/dev/null
  apt-get install -y -qq --no-install-recommends curl ca-certificates xz-utils python3 xvfb xauth x11vnc x11-utils procps openssl freerdp3-x11 freerdp3-shadow-x11 >/dev/null
  curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz" | tar -xJ -C /usr/local --strip-components=1
  useradd -m tester
  cp -r /src /home/tester/app && chown -R tester /home/tester/app
  su tester -c "cd /home/tester/app && xvfb-run -a node scripts/test-rdp-vnc.cjs && xvfb-run -a node scripts/test-rdp-signin.cjs"
'
