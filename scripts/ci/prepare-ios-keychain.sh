#!/usr/bin/env bash
# Prepare the iOS code-signing keychain for CI.

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

# Safe on the dedicated fedi-ci-mac-runner; destructive on a developer laptop.
if [ -z "${CI:-}" ] && [ -z "${GITHUB_ACTIONS:-}" ]; then
  echo "Refusing to run outside CI: this script will delete \$HOME/Library/Keychains/login.keychain-db." >&2
  echo "Set CI=1 to override if you know what you're doing." >&2
  exit 1
fi

: "${MATCH_KEYCHAIN_NAME:?MATCH_KEYCHAIN_NAME must be set}"

# Pin the keychain to $HOME/Library/Keychains/login.keychain-db. This is the
# keychain in xcodebuild's user/system search list — without targeting it
# directly, fastlane match imports the cert into a different keychain that
# xcodebuild ignores at signing time, and any stale cert in login.keychain-db
# (e.g., a revoked cert from a previous cert renewal) is what xcodebuild
# picks up instead. Wiping and recreating ensures only the cert match is
# about to install ends up in the search-list keychain.
mkdir -p "$HOME/Library/Keychains"
KEYCHAIN_PATH="$(cd "$HOME" && pwd -P)/Library/Keychains/login.keychain-db"
export MATCH_KEYCHAIN_NAME="$KEYCHAIN_PATH"
echo "Using keychain: $KEYCHAIN_PATH"

security delete-keychain "$KEYCHAIN_PATH" 2>/dev/null || true
security create-keychain -p "$MATCH_PASSWORD" "$KEYCHAIN_PATH"
security set-keychain-settings -lut 7200 "$KEYCHAIN_PATH"
security unlock-keychain -p "$MATCH_PASSWORD" "$KEYCHAIN_PATH"

# No Aqua session on headless runners, so codesign can't prompt for
# keychain access. Partition list grants access non-interactively.
security set-key-partition-list \
  -S apple-tool:,apple:,codesign:,productbuild:,productsign: \
  -s -k "$MATCH_PASSWORD" "$KEYCHAIN_PATH" >/dev/null 2>&1 || true

# Import Apple CAs and check distribution certs.
# MATCH_KEYCHAIN_NAME is set, so install-apple-certs.sh imports into
# our CI keychain rather than the default.
$REPO_ROOT/scripts/ci/install-apple-certs.sh

# Clear stale provisioning profiles. Match fetches fresh ones.
rm -rf "$HOME/Library/MobileDevice/Provisioning Profiles"/* 2>/dev/null || true
mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"

echo "Keychain ready: $KEYCHAIN_PATH"
