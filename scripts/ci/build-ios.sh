#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

ENABLE_IOS_LOGGING=${ENABLE_IOS_LOGGING:-0}

$REPO_ROOT/scripts/enforce-nix.sh

pushd $REPO_ROOT/ui/native
echo "Building iOS app bundle"

build_options="--buildFolder ./build/ --extra-params ARCHS=arm64 --verbose"
build_command="arch -arm64 npx react-native build-ios $build_options"

# Launch on selected iOS device
$build_command || {
    echo -e "\n\x1B[31;1m"
    echo "Something went wrong..."
    echo "Try deleting ui/native/ios/build for a clean build directory and try again..."
    echo -e "\x1B[31;1m"
    echo "   If that still doesn't work, follow the React Native docs for environment setup and try again:"
    echo "   https://reactnative.dev/docs/environment-setup"
    echo -e "\x1B[0m"
    popd
    exit 1
}

popd
