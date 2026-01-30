#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

BUILD_BRIDGE=${BUILD_BRIDGE:-1}
BUILD_UI_DEPS=${BUILD_UI_DEPS:-1}

if [[ "$BUILD_BRIDGE" == "0" ]]; then
  echo "Skipping bridge build..."
else
  echo "Rebuilding Android bridge with release profile"
  BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE=release $REPO_ROOT/scripts/bridge/build-bridge-android.sh
fi

if [[ "$BUILD_UI_DEPS" == "0" ]]; then
  echo "Skipping UI dependencies build..."
else
  echo "Building UI dependencies..."
  $REPO_ROOT/scripts/ui/build-deps.sh
fi

pushd $REPO_ROOT/ui/native/android

# Build numbers are timestamp based to ensure they are always
# increasing. Must be lower than 2,100,000,000 so the scheme is:
# Get the last two digits of the year
YY=$(date +"%y")
# Get the day of the year, zero-padded
DDD=$(date +"%j")
# Get the current time in HHMM format
HHMM=$(date +"%H%M")
# Combine to form the build number
BUILD_NUMBER="${YY}${DDD}${HHMM}"

# modify the build numbers so app stores will accept the upload
# We do not commit this since build numbers are timestamp based
npx react-native-version --target android --increment-build --never-amend --set-build $BUILD_NUMBER

echo "Building Android release AAB with fastlane (see $REPO_ROOT/ui/native/ios/Fastfile for lane configurations)..."
SHORT_HASH=$(git rev-parse --short HEAD)
if [ -z "${FLAVOR:-}" ]; then
    SHORT_HASH=$SHORT_HASH fastlane internal
else
    SHORT_HASH=$SHORT_HASH fastlane internal_$FLAVOR
fi
echo "Deployment complete!"

popd
