#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "Deleting DerivedData for a clean build directory..."
rm -rf ~/Library/Developer/Xcode/DerivedData

BUILD_BRIDGE=${BUILD_BRIDGE:-1}
BUILD_UI_DEPS=${BUILD_UI_DEPS:-1}
REINSTALL_PODS=${REINSTALL_PODS:-1}

if [[ "$BUILD_BRIDGE" == "0" ]]; then
  echo "Skipping bridge build..."
else
  echo "Rebuilding iOS bridge with release profile"
  BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE=release $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
fi

if [[ "$BUILD_UI_DEPS" == "0" ]]; then
  echo "Skipping UI dependencies build..."
else
  echo "Building UI dependencies..."
  $REPO_ROOT/scripts/ui/build-deps.sh
fi

if [[ "$REINSTALL_PODS" == "0" ]]; then
  echo "Skipping pod install..."
else
  echo "Installing iOS dependencies (cocoapods)"
  $REPO_ROOT/scripts/ui/install-ios-deps.sh
fi

pushd $REPO_ROOT/ui/native/ios

echo "Building Xcode release archive with fastlane (see $REPO_ROOT/ui/native/ios/Fastfile for lane configurations)..."
nix develop .#xcode --command fastlane build --verbose

echo "Build complete!"
popd
