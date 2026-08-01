#!/usr/bin/env bash
#
# One-shot helper to enable GPG-signed Aux Command releases.
#
# What it does, in order:
#   1. Checks you have `gpg` and `gh` (GitHub CLI) and that `gh` is logged in.
#   2. If your machine already holds the ORIGINAL release private key
#      (FAC0...D2A2), it exports it and stores it as the GitHub Actions secret
#      AUX_COMMAND_GPG_PRIVATE_KEY. Nothing else changes — done.
#   3. If that key is NOT present, it offers to generate a NEW release key,
#      writes the new public key to SIGNING_KEY.asc, stores the new private key
#      as the secret, and records the new fingerprint in NEW_SIGNING_FINGERPRINT
#      so the repo references can be rotated to match.
#
# The private key is never printed; it is piped straight into the GitHub secret.
#
# Usage:   bash scripts/setup-signing-key.sh
#
set -euo pipefail

REPO="Auxillo-Tech/Aux-Command"
ORIGINAL_FPR="FAC028574B9C6875D10DA4DC6443E86108ABD2A2"
KEY_UID="Aux Command Release Signing <releases@auxillo.tech>"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m  ok:\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m  !!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- 1. Prerequisites --------------------------------------------------------
say "Checking prerequisites"
command -v gpg >/dev/null 2>&1 || die "gpg is not installed. Install it: Fedora 'sudo dnf install gnupg2', Debian/Ubuntu 'sudo apt install gnupg', Arch 'sudo pacman -S gnupg'."
command -v gh  >/dev/null 2>&1 || die "GitHub CLI 'gh' is not installed. See https://cli.github.com/ (Fedora: 'sudo dnf install gh', Debian/Ubuntu: 'sudo apt install gh', Arch: 'sudo pacman -S github-cli')."
gh auth status >/dev/null 2>&1 || die "GitHub CLI is not logged in. Run 'gh auth login' first (choose GitHub.com, HTTPS, and grant repo access)."
ok "gpg, gh, and gh login are present"

set_secret() {
  # $1 = armored private key on stdin is NOT used; we pass via file-descriptor.
  gh secret set AUX_COMMAND_GPG_PRIVATE_KEY --repo "$REPO"
}

# --- 2. Do we already have the original private key? -------------------------
say "Looking for the original release private key ($ORIGINAL_FPR)"
if gpg --batch --with-colons --list-secret-keys "$ORIGINAL_FPR" >/dev/null 2>&1; then
  ok "Found the original private key on this machine."
  say "Storing it as the GitHub Actions secret AUX_COMMAND_GPG_PRIVATE_KEY"
  gpg --export-secret-keys --armor "$ORIGINAL_FPR" | gh secret set AUX_COMMAND_GPG_PRIVATE_KEY --repo "$REPO"
  ok "Secret set. No repo changes are needed — the fingerprint already matches."
  say "Final step: publish a signed release"
  echo "    Re-run the release for the current tag, or cut the next one:"
  echo "      gh workflow run release.yml   # if you want to re-run"
  echo "    or just push the next version tag (vX.Y.Z) as usual."
  echo
  ok "Done. Future releases will be GPG-signed automatically."
  exit 0
fi

warn "The original private key ($ORIGINAL_FPR) is NOT on this machine."
echo
echo "  If you have it backed up elsewhere (another computer, a password manager,"
echo "  a hardware token, a .asc backup file), import it first and re-run this script:"
echo "      gpg --import /path/to/your-private-key.asc"
echo
read -r -p "  Do you want to GENERATE A NEW signing key now instead? [y/N] " reply
[[ "$reply" =~ ^[Yy]$ ]] || { echo "  No changes made. Recover the original key, then re-run."; exit 0; }

# --- 3. Generate a new release key -------------------------------------------
say "Generating a new ed25519 release signing key"
gpg --batch --quick-generate-key "$KEY_UID" ed25519 sign 2y
NEW_FPR="$(gpg --batch --with-colons --list-keys --list-options show-only-fpr-mbox "$KEY_UID" 2>/dev/null | head -1 | awk -F: '{print $1}')"
[[ -z "$NEW_FPR" ]] && NEW_FPR="$(gpg --batch --with-colons --list-keys "$KEY_UID" | awk -F: '$1=="fpr"{print $10; exit}')"
[[ -n "$NEW_FPR" ]] || die "Could not determine the new key fingerprint."
ok "New key fingerprint: $NEW_FPR"

say "Writing the new PUBLIC key to SIGNING_KEY.asc"
gpg --export --armor "$NEW_FPR" > SIGNING_KEY.asc
ok "SIGNING_KEY.asc updated"

say "Storing the new PRIVATE key as the GitHub Actions secret"
gpg --export-secret-keys --armor "$NEW_FPR" | gh secret set AUX_COMMAND_GPG_PRIVATE_KEY --repo "$REPO"
ok "Secret AUX_COMMAND_GPG_PRIVATE_KEY set"

printf '%s\n' "$NEW_FPR" > NEW_SIGNING_FINGERPRINT
say "BACK UP YOUR NEW PRIVATE KEY NOW (you are the only holder):"
echo "      gpg --export-secret-keys --armor $NEW_FPR > aux-command-release-private.asc"
echo "      # store aux-command-release-private.asc somewhere safe & offline, then delete the file"
echo
ok "New fingerprint recorded in NEW_SIGNING_FINGERPRINT."
warn "This is a KEY ROTATION: the repo still references the old fingerprint in 6 places"
warn "(app auto-updater, package.json, docs, tests). Send that fingerprint to your"
warn "assistant (it's in NEW_SIGNING_FINGERPRINT and SIGNING_KEY.asc) to update them,"
warn "then re-release. Existing 0.2.x installs will need a manual update to 0.3.x once."
echo
ok "Local setup done."
