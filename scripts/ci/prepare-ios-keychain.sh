#!/usr/bin/env bash
# Prepare the iOS code-signing keychain for CI.

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

KEYCHAIN_PATH="${MATCH_KEYCHAIN_NAME:?MATCH_KEYCHAIN_NAME must be set}"
# Ensure absolute path under resolved $HOME (/var -> /private/var on macOS).
KEYCHAIN_PATH="$(cd "$HOME" && pwd -P)/$(basename "$KEYCHAIN_PATH")"
echo "Using keychain: $KEYCHAIN_PATH"

# Recreate the keychain each run. Stale ACLs from prior match imports
# cause errSecInternalComponent during codesign.
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
