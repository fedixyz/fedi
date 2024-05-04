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
  pod install --repo-update
  pod update
else
  pod install --repo-update
fi

popd

echo "Finished installing iOS dependencies"
