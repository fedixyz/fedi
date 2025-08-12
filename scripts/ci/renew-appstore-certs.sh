#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

if ! command -v fastlane >/dev/null 2>&1; then
  >&2 echo "Error: fastlane is not installed. Rerun this script in a nix develop shell."
  exit 1
fi

# Make sure Apple certificates are installed in the keychain
# and keychain is unlocked since there are some codesigning steps
# involved in the build process
security unlock-keychain -p $MATCH_PASSWORD $MATCH_KEYCHAIN_NAME
nix develop -c $REPO_ROOT/scripts/ci/install-apple-certs.sh

pushd $REPO_ROOT/ui/native/ios

echo "Checking certificates for expiration..."

# Function to check and renew certificates intelligently
check_and_renew_certs() {
  local flavor=$1
  local check_lane=""
  local nuke_lane=""
  
  if [ -z "$flavor" ]; then
    check_lane="check_appstore_certs"
    nuke_lane="nuke_and_regenerate_certs"
  else
    check_lane="check_appstore_certs_$flavor"
    nuke_lane="nuke_and_regenerate_certs_$flavor"
  fi
  
  echo "Checking certificate validity with lane: $check_lane"
  
  # Capture the output and exit code from the check command
  if output=$(fastlane $check_lane --verbose 2>&1); then
    echo "✅ Certificates are valid and up to date!"
    echo "No renewal needed."
    return 0
  else
    # Check if the failure was due to expired certificate
    if echo "$output" | grep -q "is not valid, please check end date and renew it if necessary"; then
      echo "🔄 Detected expired certificate. Starting renewal process..."
      echo "Running lane: $nuke_lane"
      fastlane $nuke_lane --verbose
      echo "✅ Certificate renewal completed successfully!"
      return 0
    else
      echo "❌ Certificate check failed for unknown reason:"
      echo "$output"
      echo "This might be a different issue that needs manual investigation."
      return 1
    fi
  fi
}

# Main execution
if [ -z "${FLAVOR:-}" ]; then
  echo "Checking certificates for main app (org.fedi.alpha)..."
  check_and_renew_certs
else
  echo "Checking certificates for flavor: $FLAVOR..."
  check_and_renew_certs "$FLAVOR"
fi

popd
