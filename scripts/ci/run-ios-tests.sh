#!/usr/bin/env bash

set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

DEVICE_ID=$1
BUNDLE_PATH=$2
TEST_DESCRIPTION=$3

echo "Running tests on $TEST_DESCRIPTION (Device ID: $DEVICE_ID)"
pushd $REPO_ROOT/ui
xcrun simctl uninstall $DEVICE_ID org.fedi.alpha || true
PLATFORM=ios DEVICE_ID=$DEVICE_ID BUNDLE_PATH=$BUNDLE_PATH ts-node ./native/tests/appium/runner.ts all
status=$?
echo "status=$status" >> $GITHUB_OUTPUT
popd
