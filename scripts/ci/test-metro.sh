#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Starting Metro bundler script..."

$REPO_ROOT/scripts/enforce-nix.sh

# this script tests the ui dev workspace by simulating what `react-native start` does
# however it doesn't spawn a full react-native dev server, just tests if the JS bundle can be generated
# TODO: only bundles for Android for now, we should bundle for iOS too and run this in CI on a MacOS runner

pushd $REPO_ROOT/ui/native

cleanup() {
    echo "Cleaning up..."
    rm -f android-bundle.js
}

echo "Generating JS bundle for React Native..."
echo "Bundling for Android..."
$REPO_ROOT/ui/native/node_modules/.bin/react-native bundle --entry-file index.js --platform android --bundle-output android-bundle.js || {
    echo -e "\n\x1B[31;1m"
    echo "Metro failed to generate JS bundle for Android"
    echo -e "\x1B[0m"
    cleanup
    popd
    exit 1
}

echo "JS bundle generated successfully"
cleanup
popd
