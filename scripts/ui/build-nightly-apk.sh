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

echo "Building nightly flavor release APK with fastlane (see $REPO_ROOT/ui/native/android/Fastfile for lane configurations)..."
fastlane build_nightly_apk
echo "APK built successfully at $REPO_ROOT/ui/native/android/app/build/outputs/apk/nightly/release/app-nightly-release.apk"

RELEASE_PATH=$REPO_ROOT/ui/native/android/app/build/outputs/apk/nightly/release
SOURCE=$RELEASE_PATH/app-nightly-release.apk
DESTINATION=$APK_PATH
echo "Moving apk from $SOURCE to $DESTINATION"
mv $SOURCE $DESTINATION

popd
