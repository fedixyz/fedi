#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "Building android app bundle"
pushd $REPO_ROOT/ui/native/android

# Explicitly build APK first
./gradlew assembleProductionDebug -Pandroid.injected.testOnly=false || {
    echo "Something went wrong during APK assembly..."
    popd
    exit 1
}

# Find the generated APK explicitly
APK_PATH=$(find $REPO_ROOT/ui/native/android/app/build/outputs/apk/production/debug -name "*.apk" | head -1)

export APK_PATH

popd
