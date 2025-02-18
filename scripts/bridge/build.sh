#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Generating typescript bindings"
$REPO_ROOT/scripts/bridge/ts-bindgen.sh
echo "Building ios bridge artifacts"
nix develop .#xcode -c $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
echo "Building android bridge artifacts"
$REPO_ROOT/scripts/bridge/build-bridge-android.sh
