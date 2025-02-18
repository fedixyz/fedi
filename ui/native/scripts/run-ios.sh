#!/usr/bin/env bash

# exit on failure
set -e

echo "-----WARNING-----"
echo "This script is deprecated. Check the ui/README for docs on running with Nix: just run-dev-ui"
echo "-----------------"

# re-build bridge bindings for ios
yarn build-bridge-ios

# make sure we've installed pods
pushd ios
pod install --repo-update
popd

# Launch ios. If FEDI_UDID env var is set, then run it on that device.
if [[ -z $FEDI_DEVICE_ID ]]
then
    npx react-native run-ios
else
    npx react-native run-ios --udid $FEDI_DEVICE_ID
fi