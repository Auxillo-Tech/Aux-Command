#!/usr/bin/env bash
# Runs inside a distribution container as root (see test-installers.sh):
# bash /checks.sh deb|rpm, with the built packages in /packages (read-only).
set -euo pipefail
shopt -s inherit_errexit
kind=${1:?deb or rpm}
old_version=0.4.9
helper_path=/usr/lib/aux-command/update-helper
policy_path=/usr/share/polkit-1/actions/tech.auxillo.command.install-update.policy

shopt -s nullglob
found=(/packages/*."$kind")
[ "${#found[@]}" -eq 1 ] || { echo "expected exactly one .$kind in /packages, found ${#found[@]}" >&2; exit 1; }
pkg=${found[0]}
size=$(stat -c %s "$pkg")
sum=$(sha256sum "$pkg" | cut -d' ' -f1)
key_path=/usr/lib/aux-command/release-signing-key.gpg

case "$kind" in
  deb)
    version=$(dpkg-deb -f "$pkg" Version)
    installed() { dpkg-query -W -f='${Version}' aux-command; }
    install_file() { apt-get install -y --no-install-recommends "$1"; }
    apt-get install -y -qq --no-install-recommends python3 gpg gpg-agent gpgv >/dev/null
    arch_spelling=$(dpkg --print-architecture)
    ;;
  rpm)
    version=$(rpm -qp --qf '%{VERSION}' "$pkg")
    installed() { rpm -q --qf '%{VERSION}' aux-command; }
    install_file() { dnf install -y "$1"; }
    dnf install -y -q rpm-build cpio python3 gnupg2 >/dev/null 2>&1
    arch_spelling=$(rpm -E %_arch)
    ;;
esac
echo "package version $version"
[ "$version" != "$old_version" ] || { echo "the package under test must not be $old_version" >&2; exit 1; }

# An aux-command of a chosen version, built here: same name, no files.
make_pkg() {
  local version=$1 out=$2
  rm -rf "/tmp/mk-$version"
  mkdir -p "/tmp/mk-$version"
  if [ "$kind" = deb ]; then
    mkdir -p "/tmp/mk-$version/root/DEBIAN"
    cat > "/tmp/mk-$version/root/DEBIAN/control" <<CONTROL
Package: aux-command
Version: $version
Architecture: $arch_spelling
Maintainer: Test <test@example.invalid>
Depends: python3
Description: Aux Command $version for the update test
CONTROL
    dpkg-deb --build "/tmp/mk-$version/root" "$out" >/dev/null
  else
    cat > "/tmp/mk-$version/aux-command.spec" <<SPEC
Name: aux-command
Version: $version
Release: 1
Summary: Aux Command $version for the update test
License: MIT
Requires: python3
%description
Aux Command $version for the update test.
%files
SPEC
    rpmbuild -bb --define "_topdir /tmp/mk-$version/rpmbuild" "/tmp/mk-$version/aux-command.spec" >/dev/null 2>&1
    cp "$(ls /tmp/mk-$version/rpmbuild/RPMS/*/aux-command-"$version"-1.*.rpm)" "$out"
  fi
}
mkdir -p /tmp/old
make_pkg "$old_version" /tmp/old/aux-command.$kind
old=/tmp/old/aux-command.$kind
install_file "$old" >/dev/null
[ "$(installed)" = "$old_version" ] || { echo "the older install is not $old_version" >&2; exit 1; }
echo "older install: $(installed)"

# The user's data must survive every step.
data='/home/fixture/.config/Aux Command/aux-command-data'
mkdir -p "$data"
printf '%s' '{"profiles":[]}' > "$data/profiles.json"
sha256sum "$data/profiles.json" > /tmp/before.sha256

# What the new package ships: the helper, the release signing key and the polkit action, owned by root.
if [ "$kind" = deb ]; then
  listing=$(dpkg-deb -c "$pkg")
  dpkg-deb -x "$pkg" /tmp/new
else
  listing=$(rpm -qplv "$pkg")
  mkdir -p /tmp/new
  (cd /tmp/new && rpm2cpio "$pkg" | cpio -idm --quiet)
fi
grep -E "^-rwxr-xr-x +([0-9]+ +)?(root +root|0/0) .* \.?$helper_path\$" <<<"$listing" >/dev/null \
  || { echo "the helper is not packaged as root:root 0755 at $helper_path" >&2; grep update-helper <<<"$listing" >&2 || true; exit 1; }
grep -E "^-rw-r--r-- +([0-9]+ +)?(root +root|0/0) .* \.?$policy_path\$" <<<"$listing" >/dev/null \
  || { echo "the polkit action is not packaged as root:root 0644 at $policy_path" >&2; grep policy <<<"$listing" >&2 || true; exit 1; }
helper=/tmp/new$helper_path
python3 - "/tmp/new$policy_path" "$helper_path" <<'PY'
import sys, xml.etree.ElementTree as ET
tree = ET.parse(sys.argv[1]).getroot()
actions = tree.findall('action')
assert len(actions) == 1 and actions[0].get('id') == 'tech.auxillo.command.install-update', 'one action with the Aux Command id'
action = actions[0]
assert action.findtext('message') == 'Authentication is required to install the Aux Command update'
assert action.findtext('defaults/allow_any') == 'auth_admin'
assert action.findtext('defaults/allow_inactive') == 'auth_admin'
assert action.findtext('defaults/allow_active') == 'auth_admin'
paths = [a.text for a in action.findall('annotate') if a.get('key') == 'org.freedesktop.policykit.exec.path']
assert paths == [sys.argv[2]], paths
print('polkit action ok')
PY

installed_must_be() { [ "$(installed)" = "$1" ] || { echo "installed version is $(installed), expected $1" >&2; exit 1; }; }
clean_var_tmp() { [ -z "$(find /var/tmp -maxdepth 1 -name 'aux-command-update.*')" ] || { echo "the helper left its private copy behind" >&2; exit 1; }; }

# expect STATUS DESCRIPTION -- COMMAND...  (standard input is the caller's)
expect() {
  local want=$1 what=$2 got
  shift 3
  set +e
  "$@" >/tmp/helper.out 2>&1
  got=$?
  set -e
  if [ "$got" -ne "$want" ]; then
    echo "$what: exit $got, expected $want" >&2
    cat /tmp/helper.out >&2
    exit 1
  fi
  echo "refused as expected ($want): $what"
}
run_helper() { "$helper" "$@"; }

# The key the package ships is the release key the application trusts (SIGNING_KEY.asc),
# root-owned, next to the helper.
grep -E "^-rw-r--r-- +([0-9]+ +)?(root +root|0/0) .* \.?$key_path\$" <<<"$listing" >/dev/null \
  || { echo "the release key is not packaged as root:root 0644 at $key_path" >&2; grep signing-key <<<"$listing" >&2 || true; exit 1; }
fingerprint_of() { gpg --show-keys --with-colons "$1" | awk -F: '$1 == "fpr" { print toupper($10); exit }'; }
[ -n "$(fingerprint_of /SIGNING_KEY.asc)" ] || { echo "no fingerprint for SIGNING_KEY.asc" >&2; exit 1; }
[ "$(fingerprint_of "/tmp/new$key_path")" = "$(fingerprint_of /SIGNING_KEY.asc)" ] \
  || { echo "the key in the package is not the release signing key" >&2; exit 1; }
echo "release key in the package ok: $(fingerprint_of "/tmp/new$key_path")"
deb_depends=$(if [ "$kind" = deb ]; then dpkg-deb -f "$pkg" Depends; else rpm -qp --requires "$pkg"; fi)
grep -E "gpgv|gnupg2" <<<"$deb_depends" >/dev/null || { echo "the package does not depend on gpgv or gnupg2" >&2; echo "$deb_depends" >&2; exit 1; }
if [ "$kind" = rpm ]; then
  rpm -qp --recommends "$pkg" | grep -q polkit || { echo "the rpm does not recommend polkit" >&2; exit 1; }
fi

# The packaged key is the real release key, and the private half is not here, so the signed
# manifests below come from a throwaway key that exists only in this container. Before each
# helper run the throwaway public key stands in for the shipped one at its installed path.
export GNUPGHOME=/tmp/gnupg-test GNUPGHOME_ATTACKER=/tmp/gnupg-attacker
mkdir -m 700 "$GNUPGHOME" "$GNUPGHOME_ATTACKER"
gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Test release <release@example.invalid>' ed25519 sign never >/dev/null 2>&1
GNUPGHOME=$GNUPGHOME_ATTACKER gpg --batch --pinentry-mode loopback --passphrase '' --quick-generate-key 'Attacker <attacker@example.invalid>' ed25519 sign never >/dev/null 2>&1
gpg --export > /tmp/test-release.gpg
GNUPGHOME=$GNUPGHOME_ATTACKER gpg --export > /tmp/attacker.gpg
test_fpr=$(gpg --with-colons --list-keys | awk -F: '$1 == "fpr" { print toupper($10); exit }')
attacker_fpr=$(GNUPGHOME=$GNUPGHOME_ATTACKER gpg --with-colons --list-keys | awk -F: '$1 == "fpr" { print toupper($10); exit }')
use_test_key() { mkdir -p /usr/lib/aux-command; install -o root -g root -m 0644 /tmp/test-release.gpg "$key_path"; }

# frame MANIFEST SIGNATURE [PACKAGE]: the helper's standard input.
frame() {
  printf 'AUX-UPDATE-1 %s %s\n' "$(stat -c %s "$1")" "$(stat -c %s "$2")"
  cat "$1" "$2"
  [ -z "${3:-}" ] || cat "$3"
}
# The Node architecture name release-manifest.cjs writes for this machine's package spelling.
case "$arch_spelling" in
  amd64|x86_64) node_arch=x64 ;;
  arm64|aarch64) node_arch=arm64 ;;
  *) echo "no Aux Command package for $arch_spelling" >&2; exit 1 ;;
esac
# manifest FILE PACKAGE FINGERPRINT [VERSION]: the manifest scripts/release-manifest.cjs would write.
manifest() {
  python3 - "$@" "$kind" "$arch_spelling" "$node_arch" <<'PY'
import hashlib, json, sys
out, package, fingerprint, version, kind, spelling, node_arch = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[-3], sys.argv[-2], sys.argv[-1]
data = open(package, 'rb').read()
json.dump({
    'productName': 'Aux Command', 'packageName': 'aux-command', 'version': version,
    'signing': {'status': 'signed-detached-gpg', 'key': fingerprint},
    'artifacts': [{'name': f'Aux-Command-{version}-{spelling}.{kind}', 'kind': kind, 'arch': node_arch,
                   'size': len(data), 'sha256': hashlib.sha256(data).hexdigest()}],
}, open(out, 'w'))
PY
}
sign() { gpg --batch --armor --detach-sign --output "$2" "$1"; }
asign() { GNUPGHOME=$GNUPGHOME_ATTACKER gpg --batch --armor --detach-sign --output "$2" "$1"; }

installed_must_be() { [ "$(installed)" = "$1" ] || { echo "installed version is $(installed), expected $1" >&2; exit 1; }; }
clean_var_tmp() { [ -z "$(find /var/tmp -maxdepth 1 -name 'aux-command-update.*')" ] || { echo "the helper left its private copy behind" >&2; exit 1; }; }

# expect STATUS DESCRIPTION -- COMMAND...  (standard input is the caller's)
expect() {
  local want=$1 what=$2 got
  shift 3
  set +e
  "$@" >/tmp/helper.out 2>&1
  got=$?
  set -e
  if [ "$got" -ne "$want" ]; then
    echo "$what: exit $got, expected $want" >&2
    cat /tmp/helper.out >&2
    exit 1
  fi
  echo "refused as expected ($want): $what"
}
helper=/tmp/new$helper_path
run_helper() { "$helper" "$@"; }
use_test_key
nl=$'\n'

# Properly signed material for the package under test, and for a self-built higher version.
mkdir -p /tmp/s
manifest /tmp/s/good.json "$pkg" "$test_fpr" "$version"
sign /tmp/s/good.json /tmp/s/good.json.asc
make_pkg 99.0.0 /tmp/s/mine.$kind
manifest /tmp/s/mine.json /tmp/s/mine.$kind "$test_fpr" 99.0.0
sign /tmp/s/mine.json /tmp/s/mine.json.asc
asign /tmp/s/mine.json /tmp/s/mine.attacker.asc
manifest /tmp/s/mine-attacker.json /tmp/s/mine.$kind "$attacker_fpr" 99.0.0
asign /tmp/s/mine-attacker.json /tmp/s/mine-attacker.json.asc

# Bad arguments and bad frames: nothing may be installed.
expect 64 "no arguments" -- run_helper < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
expect 64 "unknown kind" -- run_helper sh < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
expect 64 "the old protocol, where the caller chose version, size and hash" -- run_helper "$kind" "$version" "$size" "$sum" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
expect 64 "no frame, only the package" -- run_helper "$kind" < "$pkg"
expect 64 "other frame version" -- run_helper "$kind" < <(printf 'AUX-UPDATE-2 2 2\nabab')
expect 64 "empty standard input" -- run_helper "$kind" < /dev/null
expect 66 "the other package kind (the signed release has no such package for this machine)" -- run_helper "$([ "$kind" = deb ] && echo rpm || echo deb)" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
# A self-built higher-version aux-command with a size and hash the caller chose, which the helper used to
# install: no signed manifest from the release key, no installation.
expect 64 "self-built 99.0.0 with the caller's version, size and hash" -- run_helper "$kind" 99.0.0 "$(stat -c %s /tmp/s/mine.$kind)" "$(sha256sum /tmp/s/mine.$kind | cut -d' ' -f1)" < /tmp/s/mine.$kind
expect 65 "self-built 99.0.0 with its own manifest signed by another key" -- run_helper "$kind" < <(frame /tmp/s/mine-attacker.json /tmp/s/mine-attacker.json.asc /tmp/s/mine.$kind)
expect 65 "self-built 99.0.0 with a manifest and a made-up signature" -- run_helper "$kind" < <(frame /tmp/s/mine.json /tmp/s/good.json.asc /tmp/s/mine.$kind)
expect 65 "self-built 99.0.0 with a manifest that was edited after signing" -- run_helper "$kind" < <(sed 's/9\.9\.9/99.0.0/;s/"version": *"[0-9.]*"/"version":"99.0.0"/' /tmp/s/good.json > /tmp/s/edited.json; frame /tmp/s/edited.json /tmp/s/good.json.asc /tmp/s/mine.$kind)
# Real signature by the release key, but over bytes that are not exactly the package.
expect 65 "signed manifest, wrong package bytes (the self-built 99.0.0)" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc /tmp/s/mine.$kind)
expect 65 "an endless device after the signed manifest" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc; head -c 100000000 /dev/zero)
expect 65 "package one byte short" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc; head -c $((size - 1)) "$pkg")
expect 65 "package with one byte more" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg"; printf x)
# A genuine, signed manifest for a package that is not the update that was asked for.
manifest /tmp/s/lie.json "$pkg" "$test_fpr" 9.9.9
sign /tmp/s/lie.json /tmp/s/lie.json.asc
expect 66 "signed manifest names 9.9.9 but the package is $version" -- run_helper "$kind" < <(frame /tmp/s/lie.json /tmp/s/lie.json.asc "$pkg")
# The real release key from the package, which cannot have signed anything here.
install -o root -g root -m 0644 "/tmp/new$key_path" "$key_path"
expect 65 "the shipped release key does not verify a manifest the test key signed" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
use_test_key
# A release key that root does not own, or that another user can write.
chmod 0666 "$key_path"
expect 70 "release key writable by everybody" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
use_test_key
chown nobody "$key_path"
expect 70 "release key owned by somebody else" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
use_test_key
installed_must_be "$old_version"
clean_var_tmp

# The real upgrade, from the older install, through the packaged helper, with a signed manifest.
run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
installed_must_be "$version"
clean_var_tmp
sha256sum -c /tmp/before.sha256
cmp "$helper" "$helper_path"
cmp "/tmp/new$key_path" "$key_path"
[ "$(stat -c '%U:%G %a' "$helper_path")" = "root:root 755" ] || { echo "installed helper owner or mode is wrong" >&2; exit 1; }
[ "$(stat -c '%U:%G %a' "$key_path")" = "root:root 644" ] || { echo "installed release key owner or mode is wrong" >&2; exit 1; }
[ "$(stat -c '%U:%G %a' "$policy_path")" = "root:root 644" ] || { echo "installed polkit action owner or mode is wrong" >&2; exit 1; }
ldd '/opt/Aux Command/aux-command' > /tmp/libraries
if grep 'not found' /tmp/libraries; then exit 1; fi
echo "upgraded $old_version -> $(installed)"
# The upgrade replaced the throwaway key with the shipped one, as it should.
use_test_key
helper=$helper_path

# Never a downgrade, never a reinstall of the same version, even with a properly signed manifest.
manifest /tmp/s/old.json /tmp/old/aux-command.$kind "$test_fpr" "$old_version"
sign /tmp/s/old.json /tmp/s/old.json.asc
expect 66 "downgrade to $old_version" -- run_helper "$kind" < <(frame /tmp/s/old.json /tmp/s/old.json.asc /tmp/old/aux-command.$kind)
installed_must_be "$version"
expect 66 "reinstall of the installed version" -- run_helper "$kind" < <(frame /tmp/s/good.json /tmp/s/good.json.asc "$pkg")
installed_must_be "$version"
# A signed higher version installs, to show the checks above refuse for their reason.
manifest /tmp/s/up.json /tmp/s/mine.$kind "$test_fpr" 99.0.0
sign /tmp/s/up.json /tmp/s/up.json.asc
run_helper "$kind" < <(frame /tmp/s/up.json /tmp/s/up.json.asc /tmp/s/mine.$kind)
installed_must_be 99.0.0
clean_var_tmp
sha256sum -c /tmp/before.sha256
echo "UPDATE_HELPER_${kind^^}_PASSED"
