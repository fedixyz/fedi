#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Install wasm dependencies
$REPO_ROOT/scripts/ui/install-wasm.sh

# helper to install dependencies with the cache for speed, but if something fails try cleaning it and retrying
run_with_clean_retry() {
  local cmd="$1"
  echo "Running command: $cmd"
  if ! $cmd; then
    echo "Command failed, cleaning cache and retrying..."
    yarn cache clean --force
    $cmd
  fi
}

pushd $REPO_ROOT/ui
# Install NPM dependencies
if [[ -n "$CI" ]]; then
  echo "Reinstalling node modules from lockfile (yarn.lock)"
  rm -rf $REPO_ROOT/ui/node_modules
  run_with_clean_retry "yarn install --frozen-lockfile"
else
  echo "Installing node modules"
  run_with_clean_retry "yarn install"
fi
echo "Finished installing node modules"

echo "Building UI modules: @fedi/common and @fedi/injections"
yarn build:deps
echo "UI modules built: @fedi/common and @fedi/injections"

# export short commit sha for nightly version string

SHORT_HASH=$(git rev-parse --short HEAD)
export SHORT_HASH
if [[ -n "$CI" ]]; then
  echo "SHORT_HASH=$SHORT_HASH" >> "$GITHUB_OUTPUT"
fi

popd
