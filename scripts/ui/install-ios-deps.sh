#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "Installing ios dependencies with Cocoapods"

pushd $REPO_ROOT/ui/native/ios

if [[ -n "$CI" ]]; then
  echo "Deleting & deintegrating Pods for fresh install..."
  rm -rf $REPO_ROOT/ui/native/ios/Pods
  pod deintegrate
  # this logic is to prevent react native from hijacking things
  # if .xcode.env.local doesn't exist, react native to use the 'type' binary which doesn't always exist
  # pod expects a NODE_BINARY in .xcode.env.local so make sure we set it to the correct one anyway
  rm -f "$REPO_ROOT/ui/native/ios/.xcode.env.local"
  echo "export NODE_BINARY=$(nix develop .#xcode -c which node)" > $REPO_ROOT/ui/native/ios/.xcode.env.local
  # then proceed to install the pods
  pod install --repo-update
  pod update
else
  pod install --repo-update
fi

popd

echo "Finished installing iOS dependencies"
