#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Make sure Apple certificates are installed in the keychain
# and keychain is unlocked since there are some codesigning steps
# involved in the build process
security unlock-keychain -p $MATCH_PASSWORD $MATCH_KEYCHAIN_NAME
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

# Added to fix CI errors
# Codegen, although generating files in the correct directory, does not have them present for the build to complete
# We generate them manually and copy them over outselves to allow the build to complete
# This error was present after we upgraded to Xccode 16.0 and macos 15. It's only present on the CI runner.
# Similar errors: https://forums.developer.apple.com/forums/thread/716483
# Additional: https://stackoverflow.com/questions/75193781/xcode-14-did-you-forget-to-declare-this-file-as-an-output-of-a-script-phase-or-c
# Generate codegen files and prepare the directories
echo "Running codegen..."
nix develop -c npx react-native codegen

if [ $? -ne 0 ]; then
  echo "Error: Codegen process failed. Please check your environment setup and dependencies."
  exit 1
fi

echo "Creating necessary directories for generated files..."
mkdir -p $REPO_ROOT/ui/native/ios/build/generated/ios/

echo "Copying generated files..."
if cp -r $REPO_ROOT/ui/native/build/generated/ios/* $REPO_ROOT/ui/native/ios/build/generated/ios/; then
  echo "Files copied successfully."
else
  echo "Error: Failed to copy generated files. Ensure the source directory exists and contains the expected files."
  exit 1
fi

echo "Verifying copied files..."
if ls $REPO_ROOT/ui/native/ios/build/generated; then
  echo "Verification successful."
else
  echo "Error: Verification failed. No files found in the target directory."
  exit 1
fi

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