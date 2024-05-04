#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

ENABLE_ANDROID_LOGGING=${ENABLE_ANDROID_LOGGING:-0}

if [[ "$BUILD_ANDROID" == "0" ]]; then
    echo "Android build skipped"
    exit 0
fi

$REPO_ROOT/scripts/enforce-nix.sh

cd $REPO_ROOT/ui/native
echo "Building & installing android app bundle"

# react-native tries to start metro in a new terminal window if none is detected
# so wait a few seconds for the mprocs metro terminal to start first
sleep 2
run_android_result=0
npx react-native run-android --active-arch-only --mode=ProductionDebug --verbose|| {
    echo "Something went wrong..."
    run_android_result=1
}

# Start logging only if the previous command was successful
if [[ "$ENABLE_ANDROID_LOGGING" == "1" && $run_android_result -eq 0 ]]; then
    echo "Starting android logging..."
    npx react-native log-android
fi
