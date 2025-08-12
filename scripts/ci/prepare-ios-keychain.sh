#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

# Make sure Apple certificates are installed in the keychain
# and keychain is unlocked since there are some codesigning steps
# involved in the build process
security unlock-keychain -p $MATCH_PASSWORD $MATCH_KEYCHAIN_NAME
nix develop .#xcode -c $REPO_ROOT/scripts/ci/install-apple-certs.sh

# Nightly and Production use separate certificates but use the same
# name (e.g. "Apple Distribution: FEDI, INC. (4JUZY29459)")
# This script deletes all certificates with that name to prevent conflicts
# since fastlane can download & install them fresh from the github repo anyway
rm -rf "/Users/runner/Library/MobileDevice/Provisioning Profiles"/*
echo "Deleting all Apple Distribution: FEDI, INC. (4JUZY29459) certificates from the keychain..."
# Check if any certificates exist first
if security find-certificate -a -Z -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME >/dev/null 2>&1; then
  echo "Found certificates, proceeding with SHA-1 deletion..."
  if security find-certificate -a -Z -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME | grep "SHA-1 hash:" | awk '{print $3}' | while read hash; do
    echo "Deleting certificate with SHA-1: $hash"
    if ! security delete-certificate -Z "$hash" $MATCH_KEYCHAIN_NAME; then
      echo "Failed to delete certificate with SHA-1: $hash"
    fi
  done; then
      echo "Certificate deletion by SHA-1 completed"
  fi

  echo "Attempting to delete any remaining certificates..."
  while security find-certificate -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME >/dev/null 2>&1; do
    if ! security delete-certificate -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME; then
      echo "Failed to delete certificate"
      break
    fi
  done
else
    echo "No certificates found"
fi

# Verify deletion, but proceed even if some certificates still exist
echo "Verifying certificate deletion..."
if security find-certificate -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME >/dev/null 2>&1; then
  echo "WARNING: Some certificates may still exist in keychain"
  security find-certificate -c "Apple Distribution: FEDI, INC. (4JUZY29459)" $MATCH_KEYCHAIN_NAME || true
else
  echo "✅ All certificates successfully deleted (or none existed)"
fi
