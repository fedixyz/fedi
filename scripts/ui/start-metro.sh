#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "ui: starting react-native metro bundler"

cd $REPO_ROOT/ui/native
yarn start
