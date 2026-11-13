#!/usr/bin/env bash
# Qualifies the saved-credential version gate (src/main/lib/ssh-askpass.cjs)
# against REAL OpenSSH 8.4p1, 8.5p1, 8.6p1 and 8.7p1 clients.
#
# Each client is built from the official source tarball (sha256 pinned, and
# the OpenBSD release signature checked when gpg is installed) inside a
# memory- and CPU-limited container, then run, as a non-root user with no
# network but loopback, against two ssh2 servers by ssh-version-gate-probe.cjs:
# a normal password / public-key server and a hostile keyboard-interactive
# server that imitates OpenSSH's own prompts. The probe drives the app's real
# AskpassPolicy and createAskpassSession.
#
# Result, one VERDICT line per version:
#   below 8.7  the saved secret is never released (vault read 0 times), the
#              user gets a dialog
#   8.7        the saved secret answers only OpenSSH's own prompt, never a
#              prompt worded by the server
# A version that cannot be built or run is reported as NOT RUN, never as passed.
#
# Needs: docker, curl, sha256sum, and network access for the tarballs and
# `npm ci`. Not part of `npm run check`.
#
# Usage: scripts/qualify-ssh-version-gate.sh [--work DIR] [--versions "8.4p1 8.7p1"]
#   AUX_SSH_GATE_WORK      scratch directory (default: $TMPDIR/aux-ssh-gate); put it
#                          on a scratch disk, it holds sources, builds and node_modules
#   AUX_SSH_GATE_IMAGE     build and run image (default node:22-bullseye: OpenSSL 1.1.1,
#                          which OpenSSH 8.4 to 8.7 were written for)
#   AUX_SSH_GATE_VERSIONS  versions to run (default: 8.4p1 8.5p1 8.6p1 8.7p1)
# Exit status: 0 all versions passed, 1 a version failed, 2 a version was NOT RUN.

set -euo pipefail
shopt -s inherit_errexit

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
work=${AUX_SSH_GATE_WORK:-${TMPDIR:-/tmp}/aux-ssh-gate}
image=${AUX_SSH_GATE_IMAGE:-node:22-bullseye}
versions=${AUX_SSH_GATE_VERSIONS:-"8.4p1 8.5p1 8.6p1 8.7p1"}
mirror=https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/portable

while [ $# -gt 0 ]; do
  case $1 in
    --work) work=${2:?--work needs a directory}; shift 2 ;;
    --versions) versions=${2:?--versions needs a list}; shift 2 ;;
    -h|--help) sed -n '2,32p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 64 ;;
  esac
done

# sha256 of the official tarballs; each was also checked against the OpenBSD
# release signature (Damien Miller, keys 59C2118E... for 8.4p1, 7168B983... after).
pinned_sha256() {
  case $1 in
    8.4p1) echo 5a01d22e407eb1c05ba8a8f7c654d388a13e9f226e4ed33bd38748dafa1d2b24 ;;
    8.5p1) echo f52f3f41d429aa9918e38cf200af225ccdd8e66f052da572870c89737646ec25 ;;
    8.6p1) echo c3e6e4da1621762c850d03b47eed1e48dff4cc9608ddeb547202a234df8ed7ae ;;
    8.7p1) echo 7ca34b8bb24ae9e50f33792b7091b3841d7e1b440ff57bc9fabddf01e2ed1e24 ;;
    *) return 1 ;;
  esac
}
signing_fingerprints="59C2118ED206D927E667EBE3D3E5F56B6D920D30 7168B983815A5EEF59A4ADFD2A3F414E736060BA"

command -v docker >/dev/null || { echo "docker is required" >&2; exit 64; }
command -v curl >/dev/null || { echo "curl is required" >&2; exit 64; }

host_uid=$(id -u)
host_gid=$(id -g)
mkdir -p "$work/cache" "$work/bin" "$work/pkg" "$work/results"
chmod 755 "$work" "$work/bin"

echo "repo:  $repo"
echo "work:  $work"
echo "image: $image ($(docker image inspect --format '{{index .RepoDigests 0}}' "$image" 2>/dev/null || echo 'digest unknown, run docker pull first'))"

# Runtime dependencies of the probe (ssh2), installed once per lockfile.
lock_hash=$(sha256sum "$repo/package-lock.json" | cut -d' ' -f1)
if [ "$(cat "$work/pkg/.lock" 2>/dev/null || true)" != "$lock_hash" ] || [ ! -d "$work/pkg/node_modules/ssh2" ]; then
  echo "installing ssh2 (npm ci --omit=dev --ignore-scripts)"
  rm -rf "$work/pkg"; mkdir -p "$work/pkg"
  cp "$repo/package.json" "$repo/package-lock.json" "$work/pkg/"
  docker run --rm --memory 1g --memory-swap 1g --cpus 1 --pids-limit 256 \
    --user "$host_uid:$host_gid" -e HOME=/tmp -e npm_config_cache=/tmp/npm \
    --tmpfs /tmp:rw,exec,nosuid,mode=1777,size=512m \
    -v "$work/pkg:/pkg" -w /pkg "$image" \
    npm ci --omit=dev --ignore-scripts --no-audit --no-fund >"$work/results/npm-ci.log" 2>&1 \
    || { echo "npm ci failed, see $work/results/npm-ci.log" >&2; exit 2; }
  echo "$lock_hash" >"$work/pkg/.lock"
fi

fetch_and_check() {
  local v=$1 tar="$work/cache/openssh-$1.tar.gz"
  local want; want=$(pinned_sha256 "$v") || { echo "no pinned checksum for $v"; return 1; }
  if [ ! -f "$tar" ] || [ ! -f "$tar.asc" ]; then
    curl -fsSL --max-time 120 -o "$tar" "$mirror/openssh-$v.tar.gz" \
      && curl -fsSL --max-time 60 -o "$tar.asc" "$mirror/openssh-$v.tar.gz.asc" \
      || { rm -f "$tar" "$tar.asc"; echo "download of openssh-$v failed"; return 1; }
  fi
  local got; got=$(sha256sum "$tar" | cut -d' ' -f1)
  [ "$got" = "$want" ] || { rm -f "$tar" "$tar.asc"; echo "sha256 mismatch for openssh-$v.tar.gz (got $got)"; return 1; }
  if command -v gpg >/dev/null; then
    local home status fp ok=1
    home=$(mktemp -d); chmod 700 "$home"
    curl -fsSL --max-time 60 -o "$home/key.asc" https://cdn.openbsd.org/pub/OpenBSD/OpenSSH/RELEASE_KEY.asc 2>/dev/null || true
    GNUPGHOME=$home gpg --batch --quiet --import "$home/key.asc" 2>/dev/null || true
    status=$(GNUPGHOME=$home gpg --batch --status-fd 1 --verify "$tar.asc" "$tar" 2>/dev/null || true)
    rm -rf "$home"
    fp=$(printf '%s\n' "$status" | awk '/^\[GNUPG:\] VALIDSIG/ {print $NF}')
    for allowed in $signing_fingerprints; do [ "$fp" = "$allowed" ] && ok=0; done
    [ $ok -eq 0 ] || { echo "release signature for openssh-$v is not valid for a known signing key (got '${fp:-none}')"; return 1; }
    echo "  signature ok ($fp)"
  else
    echo "  gpg not installed: signature NOT checked, sha256 pin only"
  fi
}

build_client() {
  local v=$1
  [ -x "$work/bin/ssh-$v" ] && { echo "  using existing build"; return 0; }
  docker run --rm --memory 3g --memory-swap 3g --cpus 2 --pids-limit 1024 \
    --user "$host_uid:$host_gid" -e HOME=/tmp --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp:rw,exec,nosuid,mode=1777,size=768m \
    -v "$work/cache:/cache:ro" -v "$work/bin:/out" "$image" \
    sh -ec "tar xzf /cache/openssh-$v.tar.gz -C /tmp && cd /tmp/openssh-$v \
      && ./configure --prefix=/tmp/inst --sysconfdir=/nonexistent --without-pam --without-selinux --with-privsep-path=/nonexistent >/tmp/configure.log 2>&1 \
      && make -j2 ssh >/tmp/make.log 2>&1 \
      && cp ssh /out/ssh-$v.new && chmod 755 /out/ssh-$v.new" \
    >"$work/results/build-$v.log" 2>&1 \
    || { echo "build of openssh-$v failed, see $work/results/build-$v.log"; return 1; }
  mv "$work/bin/ssh-$v.new" "$work/bin/ssh-$v"
}

run_probe() {
  local v=$1
  docker run --rm --user 1000:1000 --memory 1g --memory-swap 1g --cpus 1 --pids-limit 256 \
    --network none --cap-drop ALL --security-opt no-new-privileges --read-only \
    --tmpfs /tmp:rw,exec,nosuid,mode=1777,size=128m -e HOME=/tmp \
    -v "$repo/src:/work/src:ro" -v "$repo/package.json:/work/package.json:ro" \
    -v "$repo/scripts/ssh-version-gate-probe.cjs:/work/scripts/ssh-version-gate-probe.cjs:ro" \
    -v "$work/pkg/node_modules:/work/node_modules:ro" \
    -v "$work/bin/ssh-$v:/opt/ssh/ssh:ro" \
    -w /work "$image" \
    node /work/scripts/ssh-version-gate-probe.cjs --ssh /opt/ssh/ssh --repo /work
}

failed=0
notrun=0
summary=()
for v in $versions; do
  echo "== OpenSSH $v"
  if ! fetch_and_check "$v" || ! build_client "$v"; then
    echo "NOT RUN OpenSSH $v"
    summary+=("NOT RUN OpenSSH $v (could not fetch, verify or build; see above)")
    notrun=$((notrun + 1))
    continue
  fi
  log="$work/results/probe-$v.log"
  set +e
  run_probe "$v" >"$log" 2>&1
  status=$?
  set -e
  cat "$log"
  case $status in
    0) summary+=("$(grep '^VERDICT' "$log" | tail -1)") ;;
    1) summary+=("$(grep '^VERDICT' "$log" | tail -1)"); failed=$((failed + 1)) ;;
    *) summary+=("NOT RUN OpenSSH $v (probe exit $status; see $log)"); notrun=$((notrun + 1)) ;;
  esac
done

echo
echo "== Summary"
printf '%s\n' "${summary[@]}"
[ $failed -eq 0 ] || exit 1
[ $notrun -eq 0 ] || exit 2
