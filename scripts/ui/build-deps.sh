#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Install wasm dependencies
$REPO_ROOT/scripts/ui/install-wasm.sh

pushd $REPO_ROOT/ui
# Install NPM dependencies
if [[ -n "$CI" ]]; then
  echo "Reinstalling node modules from lockfile (yarn.lock)"
  rm -rf $REPO_ROOT/ui/node_modules
  yarn install --frozen-lockfile
else
  echo "Installing node modules"
  yarn install
fi
echo "Finished installing node modules"

echo "Building UI modules: @fedi/common and @fedi/injections"
yarn build:deps
echo "UI modules built: @fedi/common and @fedi/injections"

popd
