#!/usr/bin/env bash
# Build the arm64 AppImage, deb and rpm.
#
# Works natively on an arm64 host (the arm64 runner of the release workflow)
# and as a cross-build on x86_64: electron-builder fetches the arm64 Electron,
# and the packages contain no native Node modules, so no compiler is involved
# (see scripts/electron-builder-arm64.cjs).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v rpmbuild >/dev/null 2>&1 || {
  echo "ERROR: electron-builder needs rpmbuild to produce the RPM artifact (Debian/Ubuntu: sudo apt install rpm, Fedora: sudo dnf install rpm-build)." >&2
  exit 1
}

exec npx electron-builder --linux AppImage deb rpm --arm64 --config scripts/electron-builder-arm64.cjs "$@"
