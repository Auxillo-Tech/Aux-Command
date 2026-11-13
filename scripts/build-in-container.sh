#!/usr/bin/env bash
# Build the AppImage, deb and rpm inside an Ubuntu 24.04 container, the same
# base the release workflow uses. Use this on hosts whose own compiler is too
# old for the current Electron headers (for example Debian 12), where
# `npm run dist:x64` fails while rebuilding native modules.
#
# Only files tracked by git are copied into a scratch directory, so the build
# never sees local node_modules, secrets or untracked files. The packages are
# unsigned development builds: never publish them.
#
# AUX_BUILD_ARCH=arm64 cross-builds the arm64 packages instead (the release
# workflow builds those natively on an arm64 runner; this is for checking
# them on an x86_64 machine).
#
# Usage: [AUX_BUILD_ARCH=arm64] scripts/build-in-container.sh [output-directory]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="$(mkdir -p "${1:-$ROOT/dist}" && cd "${1:-$ROOT/dist}" && pwd)"
IMAGE="${AUX_BUILD_IMAGE:-ubuntu:24.04}"
NODE_VERSION="${AUX_BUILD_NODE_VERSION:-22.23.4}"
TARGET_ARCH="${AUX_BUILD_ARCH:-x64}"
case "$TARGET_ARCH" in x64|arm64) ;; *) echo "AUX_BUILD_ARCH must be x64 or arm64" >&2; exit 1 ;; esac
command -v docker >/dev/null 2>&1 || { echo "docker is required" >&2; exit 1; }

WORK="$(mktemp -d "${TMPDIR:-/tmp}/aux-command-build.XXXXXX")"
cleanup() {
  # Files created by the container belong to root; remove them from inside one.
  docker run --rm --network none --memory 256m --cpus 1 -v "$WORK:/work" "$IMAGE" find /work -mindepth 1 -delete >/dev/null 2>&1 || true
  rmdir "$WORK" 2>/dev/null || true
}
trap cleanup EXIT

(cd "$ROOT" && git ls-files -z | xargs -0 cp --parents -t "$WORK")

docker run --rm --memory "${AUX_BUILD_MEMORY:-6g}" --cpus "${AUX_BUILD_CPUS:-2}" -e NODE_VERSION="$NODE_VERSION" -e TARGET_ARCH="$TARGET_ARCH" -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$WORK:/src" -v "$OUTPUT:/out" "$IMAGE" bash -euo pipefail -c '
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq >/dev/null
    apt-get install -y -qq --no-install-recommends curl ca-certificates xz-utils clang make python3 rpm libarchive-tools git file >/dev/null
    node_dist="https://nodejs.org/dist/v${NODE_VERSION}"
    node_tar="node-v${NODE_VERSION}-linux-x64.tar.xz"
    node_tmp="$(mktemp -d)"
    curl -fsSL -o "$node_tmp/$node_tar" "$node_dist/$node_tar"
    curl -fsSL -o "$node_tmp/SHASUMS256.txt" "$node_dist/SHASUMS256.txt"
    (cd "$node_tmp" && grep -F "  $node_tar" SHASUMS256.txt | sha256sum -c -)
    tar -xJ -f "$node_tmp/$node_tar" -C /usr/local --strip-components=1
    rm -rf "$node_tmp"
    cd /src
    npm ci --no-fund --no-audit
    if [ "$TARGET_ARCH" = arm64 ]; then
      npm run dist:arm64 -- --publish never
    else
      CC=clang CXX=clang++ npm run dist:x64 -- --publish never
    fi
    for f in dist/*.AppImage dist/*.deb dist/*.rpm dist/latest*.yml dist/*.cdx.json; do
      cp -f "$f" /out/
      chown "$HOST_UID:$HOST_GID" "/out/$(basename "$f")"
    done
  '
echo "Unsigned development packages are in $OUTPUT"
find "$OUTPUT" -maxdepth 1 \( -name '*.AppImage' -o -name '*.deb' -o -name '*.rpm' \) -ls
