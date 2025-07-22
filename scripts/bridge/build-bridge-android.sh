#!/usr/bin/env bash

# exit on failure
set -e

source "$REPO_ROOT/scripts/common.sh"

export BUILD_ALL_BRIDGE_TARGETS=${BUILD_ALL_BRIDGE_TARGETS:-0}

# only build emulator target by default
export BRIDGE_TARGETS_TO_BUILD=("aarch64-linux-android")

if [ "$BUILD_ALL_BRIDGE_TARGETS" == "1" ]; then
  export BRIDGE_TARGETS_TO_BUILD=("aarch64-linux-android" "x86_64-linux-android" "armv7-linux-androideabi")
fi

if [[ -n "$CI" ]]; then
  echo "Building bridge in CI using nix build..."
  nix build -L .#fedi-android-bridge-libs
  FM_BUILD_BRIDGE_ANDROID_LIBS_OUT=./result/share/fedi-android "$REPO_ROOT/scripts/bridge/install-bridge-android.sh"
else
  export FM_BUILD_BRIDGE_ANDROID_LIBS_OUT=$REPO_ROOT/bridge/fedi-android/kotlinLibDeps
  "$REPO_ROOT/scripts/bridge/build-bridge-android-libs.sh"
  "$REPO_ROOT/scripts/bridge/install-bridge-android.sh"

  echo "Cleaning up intermediate dependencies..."
  echo "Removing $FM_BUILD_BRIDGE_ANDROID_LIBS_OUT..."
  rm -rf "$FM_BUILD_BRIDGE_ANDROID_LIBS_OUT" || true
fi
