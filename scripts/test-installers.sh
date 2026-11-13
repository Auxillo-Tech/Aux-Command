#!/usr/bin/env bash
# Installs the built deb and rpm packages in clean containers and drives the
# one-click update helper that the packages ship, as real root with the real
# package managers: Debian 12, Ubuntu 24.04 and Fedora 44.
#
# On each distribution it installs an older aux-command first, then proves:
# the packaged helper, release signing key and polkit action have the right
# owners and modes; the helper refuses every bad argument, every manifest the
# release key did not sign and every byte stream that is not exactly the signed
# package; it upgrades the older install to the new package; and
# it refuses a downgrade and a reinstall. See installer-container-checks.sh.
set -euo pipefail
packages=$(realpath "${1:-dist}")
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
checks="$root/scripts/installer-container-checks.sh"
# Only isolated, automatically removed, resource-limited containers see the
# read-only installers; they expose no services or host directories.
limits=(--memory "${AUX_TEST_MEMORY:-3g}" --memory-swap "${AUX_TEST_MEMORY:-3g}" --cpus "${AUX_TEST_CPUS:-2}" --pids-limit 2048)
mounts=(-v "$packages:/packages:ro" -v "$checks:/checks.sh:ro" -v "$root/SIGNING_KEY.asc:/SIGNING_KEY.asc:ro")
for distro in debian:12-slim ubuntu:24.04; do
  echo "== $distro (deb)"
  docker run --rm -i "${limits[@]}" "${mounts[@]}" -e DEBIAN_FRONTEND=noninteractive "$distro" bash -se <<'SH'
apt-get update -qq
bash /checks.sh deb
SH
done
echo "== fedora:44 (rpm)"
docker run --rm -i "${limits[@]}" "${mounts[@]}" fedora:44 bash -se <<'SH'
bash /checks.sh rpm
SH
