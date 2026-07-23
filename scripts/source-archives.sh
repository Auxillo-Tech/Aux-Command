#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$ROOT/dist"
VERSION="$(node -p "require('$ROOT/package.json').version")"
BASE="aux-command-${VERSION}-source"
STAGE="$(mktemp -d /tmp/aux-command-source-XXXXXX)"
trap 'rm -rf -- "$STAGE"' EXIT

mkdir -p "$DIST" "$STAGE/$BASE"
tar \
  --exclude='./node_modules' \
  --exclude='./dist' \
  --exclude='./.cache' \
  --exclude='./.git' \
  --exclude='./.pytest_cache' \
  --exclude='./__pycache__' \
  -cf - -C "$ROOT" . | tar -xf - -C "$STAGE/$BASE"

tar -czf "$DIST/$BASE.tar.gz" -C "$STAGE" "$BASE"
(
  cd "$STAGE"
  zip -qr "$DIST/$BASE.zip" "$BASE"
)

printf '%s\n' "$DIST/$BASE.tar.gz" "$DIST/$BASE.zip"
