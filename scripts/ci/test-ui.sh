#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# install node modules and build ui dependencies
if [[ "$REINSTALL_UI_DEPS" == "1" ]]; then
    $REPO_ROOT/scripts/ui/build-deps.sh
fi

pushd $REPO_ROOT/ui

# Check for Prettier, ESLint, + Typescript errors
yarn lint

# Run tests with Jest
yarn test

popd
