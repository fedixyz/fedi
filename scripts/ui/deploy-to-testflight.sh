#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Make sure Apple certificates are installed in the keychain
$REPO_ROOT/scripts/ci/install-apple-certs.sh

BUILD_BRIDGE=${BUILD_BRIDGE:-1}
BUILD_UI_DEPS=${BUILD_UI_DEPS:-1}
REINSTALL_PODS=${REINSTALL_PODS:-1}

# First, delete DerivedData to remove outdated build artifacts
echo "Deleting DerivedData for a clean build directory..."
rm -rf $REPO_ROOT/ui/native/ios/build
if [[ -n "$CI" ]]; then
  rm -rf /Users/runner/Library/Developer/Xcode/DerivedData
else
  rm -rf ~/Library/Developer/Xcode/DerivedData
fi

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
nix develop -c npx react-native-version --target ios --increment-build --never-amend --set-build $BUILD_NUMBER

echo "Building Xcode release archive with fastlane (see $REPO_ROOT/ui/native/ios/Fastfile for lane configurations)..."
if [ -z "${FLAVOR:-}" ]; then
  nix develop .#xcode --command fastlane beta_ci --verbose
else
  nix develop .#xcode --command fastlane beta_ci_$FLAVOR --verbose
fi

echo "Build complete!"

popd
