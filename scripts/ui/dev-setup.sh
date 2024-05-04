#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "Starting dev-ui setup"

# install node modules and build ui dependencies
if [[ "$REINSTALL_UI_DEPS" == "1" ]]; then
    $REPO_ROOT/scripts/ui/build-deps.sh
fi

if [[ "$BUILD_BRIDGE" == "1" ]]; then
    echo "Building fedi bridge"
    if [[ "$BUILD_ANDROID" == "1" ]]; then
        $REPO_ROOT/scripts/bridge/build-bridge-android.sh
    fi
    if [[ "$BUILD_IOS" == "1" ]]; then
        $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
    fi
fi

if [[ "$REINSTALL_PODS" == "1" ]]; then
    nix develop .#xcode -c $REPO_ROOT/scripts/ui/install-ios-deps.sh
fi

echo "Finished dev-ui setup"
