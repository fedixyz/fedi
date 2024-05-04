#!/usr/bin/env bash

# exit on failure
set -e

echo "-----WARNING-----"
echo "This script is deprecated. Check the ui/README for docs on running with Nix: just run-dev-ui"
echo "-----------------"

# re-build bridge bindings for android
yarn build-bridge-android

# launch android production flavor in debug mode
npx react-native run-android --active-arch-only --mode=ProductionDebug --verbose
