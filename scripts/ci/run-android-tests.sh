#!/usr/bin/env bash

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
$REPO_ROOT/scripts/enforce-nix.sh

export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/tools:$ANDROID_HOME/tools/bin:$ANDROID_HOME/platform-tools

AVD=$1
BUNDLE_PATH=$2
TEST_DESCRIPTION=$3

echo "Running tests on $TEST_DESCRIPTION (Device ID: $DEVICE_ID)"
pushd $REPO_ROOT/ui
PLATFORM=android AVD=$AVD BUNDLE_PATH=$BUNDLE_PATH ts-node $REPO_ROOT/ui/native/tests/appium/runner.ts all
status=$?
echo "status=$status" >> $GITHUB_OUTPUT
popd
