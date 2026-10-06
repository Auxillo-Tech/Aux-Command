#!/usr/bin/env bash
set -euo pipefail
packages=$(realpath "${1:-dist}")
# Only isolated, automatically removed containers see the read-only installers.
for distro in debian:12-slim ubuntu:24.04; do
  # Feed the script with -i; the container exposes no services or host directories.
  docker run --rm -i -v "$packages:/packages:ro" "$distro" bash -se <<'SH'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
mkdir -p '/home/fixture/.config/Aux Command/aux-command-data'
printf '%s' '{"profiles":[]}' > '/home/fixture/.config/Aux Command/aux-command-data/profiles.json'
sha256sum '/home/fixture/.config/Aux Command/aux-command-data/profiles.json' > /tmp/before.sha256
apt-get install -y --no-install-recommends /packages/*.deb
sha256sum -c /tmp/before.sha256
ldd '/opt/Aux Command/aux-command' > /tmp/libraries
if grep 'not found' /tmp/libraries; then exit 1; fi
dpkg-query -W aux-command
SH
done
docker run --rm -i -v "$packages:/packages:ro" fedora:44 bash -se <<'SH'
mkdir -p '/home/fixture/.config/Aux Command/aux-command-data'
printf '%s' '{"profiles":[]}' > '/home/fixture/.config/Aux Command/aux-command-data/profiles.json'
sha256sum '/home/fixture/.config/Aux Command/aux-command-data/profiles.json' > /tmp/before.sha256
dnf install -y /packages/*.rpm
sha256sum -c /tmp/before.sha256
ldd '/opt/Aux Command/aux-command' > /tmp/libraries
if grep 'not found' /tmp/libraries; then exit 1; fi
rpm -q aux-command
SH
