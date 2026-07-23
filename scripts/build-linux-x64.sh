#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

LIB_DIR="$ROOT/.cache/build-libs/libxcrypt-compat/usr/lib64"
RPMBUILD_DIR="$ROOT/.cache/build-tools/rpm-build/usr/bin"

has_libcrypt_compat() {
  ldconfig -p 2>/dev/null | grep -q 'libcrypt\.so\.1' || [[ -e "$LIB_DIR/libcrypt.so.1" ]]
}

prepare_fedora_libcrypt_compat() {
  [[ -e "$LIB_DIR/libcrypt.so.1" ]] && return 0
  if ! command -v dnf >/dev/null 2>&1 || ! command -v rpm2cpio >/dev/null 2>&1 || ! command -v cpio >/dev/null 2>&1; then
    return 1
  fi

  local work="$ROOT/.cache/build-libs/download"
  rm -rf "$work" "$ROOT/.cache/build-libs/libxcrypt-compat"
  mkdir -p "$work" "$ROOT/.cache/build-libs/libxcrypt-compat"

  echo "libcrypt.so.1 not found; downloading Fedora libxcrypt-compat locally for electron-builder fpm..." >&2
  dnf download --arch=x86_64 --destdir "$work" libxcrypt-compat >/dev/null
  local rpm
  rpm="$(find "$work" -maxdepth 1 -name 'libxcrypt-compat-*.x86_64.rpm' | head -n 1)"
  [[ -n "$rpm" ]] || return 1
  (cd "$ROOT/.cache/build-libs/libxcrypt-compat" && rpm2cpio "$rpm" | cpio -id --quiet)
  [[ -e "$LIB_DIR/libcrypt.so.1" ]]
}

if ! has_libcrypt_compat; then
  if ! prepare_fedora_libcrypt_compat; then
    cat >&2 <<'EOF'
ERROR: electron-builder's bundled fpm requires libcrypt.so.1 to build .deb/.rpm packages.
Install the distro compatibility package (Fedora: sudo dnf install libxcrypt-compat) or build on a host that already provides libcrypt.so.1.
EOF
    exit 1
  fi
fi

prepare_fedora_rpmbuild() {
  command -v rpmbuild >/dev/null 2>&1 && return 0
  [[ -x "$RPMBUILD_DIR/rpmbuild" ]] && return 0
  if ! command -v dnf >/dev/null 2>&1 || ! command -v rpm2cpio >/dev/null 2>&1 || ! command -v cpio >/dev/null 2>&1; then
    return 1
  fi

  local work="$ROOT/.cache/build-tools/download"
  rm -rf "$work" "$ROOT/.cache/build-tools/rpm-build"
  mkdir -p "$work" "$ROOT/.cache/build-tools/rpm-build"

  echo "rpmbuild not found; downloading Fedora rpm-build locally for electron-builder fpm..." >&2
  dnf download --arch=x86_64 --destdir "$work" rpm-build >/dev/null
  local rpm
  rpm="$(find "$work" -maxdepth 1 -name 'rpm-build-*.x86_64.rpm' | head -n 1)"
  [[ -n "$rpm" ]] || return 1
  (cd "$ROOT/.cache/build-tools/rpm-build" && rpm2cpio "$rpm" | cpio -id --quiet)
  [[ -x "$RPMBUILD_DIR/rpmbuild" ]]
}

if ! prepare_fedora_rpmbuild; then
  cat >&2 <<'EOF'
ERROR: electron-builder needs rpmbuild to produce the RPM artifact.
Install the distro package (Fedora: sudo dnf install rpm-build) or build on a host that already provides rpmbuild.
EOF
  exit 1
fi

export PATH="$RPMBUILD_DIR:$PATH"
export LD_LIBRARY_PATH="$LIB_DIR:${LD_LIBRARY_PATH:-}"
exec npx electron-builder --linux AppImage deb rpm --x64 "$@"
