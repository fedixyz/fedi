#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

$REPO_ROOT/scripts/ui/build-deps.sh

pushd $REPO_ROOT/ui

# Check for Prettier, ESLint, + Typescript errors
yarn lint

# Run tests with Jest
yarn test

popd
