#!/usr/bin/env bash
# Make Electron's bundled SUID sandbox helper usable on a hosted CI runner.
#
# Electron ships node_modules/electron/dist/chrome-sandbox, which Chromium only
# accepts when it is owned by root with mode 4755. npm extracts it as the
# runner user, so the UI qualification aborts with exit 133 ("The SUID sandbox
# helper binary was found, but is not configured correctly"). Packaged installs
# (deb/rpm postinst) set exactly this ownership and mode; this script does the
# same for the job-local copy. The sandbox itself stays fully enabled: nothing
# here turns Chromium's sandbox off or weakens any runner policy.
#
# Fail closed: refuse outside CI, refuse anything but a regular file, and
# verify the final owner and mode instead of trusting the privileged command.
set -euo pipefail

helper="${AUX_SANDBOX_HELPER:-node_modules/electron/dist/chrome-sandbox}"
# The privileged command is overridable only so tests can prove fail-closed
# behaviour with a fake; CI uses the runner's non-interactive sudo.
read -r -a privileged <<< "${AUX_SANDBOX_PRIVILEGED_COMMAND:-sudo -n}"

fail() { echo "ci-enable-electron-sandbox: $*" >&2; exit 1; }

[[ "${CI:-}" == "true" ]] || fail "refusing to change ownership outside CI (CI=true not set)"
[[ "$(uname -s)" == "Linux" ]] || fail "only Linux runners use the SUID sandbox helper"
[[ -e "$helper" ]] || fail "helper not found: $helper (install the locked Electron runtime first)"
[[ ! -L "$helper" ]] || fail "helper must not be a symlink: $helper"
[[ -f "$helper" ]] || fail "helper is not a regular file: $helper"

"${privileged[@]}" chown root:root "$helper" || fail "could not make $helper root-owned"
"${privileged[@]}" chmod 4755 "$helper" || fail "could not set mode 4755 on $helper"

owner="$(stat -c '%u:%g' "$helper")"
mode="$(stat -c '%a' "$helper")"
[[ "$owner" == "0:0" ]] || fail "verification failed: owner is $owner, expected 0:0"
[[ "$mode" == "4755" ]] || fail "verification failed: mode is $mode, expected 4755"
[[ ! -L "$helper" && -f "$helper" ]] || fail "verification failed: helper changed type during setup"

echo "ci-enable-electron-sandbox: $helper is root-owned with mode 4755; Electron sandbox stays enabled"
