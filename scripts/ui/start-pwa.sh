#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

if [[ "$BUILD_PWA" == "0" ]]; then
    echo "PWA build skipped"
    exit 0
fi

$REPO_ROOT/scripts/enforce-nix.sh

echo "Building @fedi/common code (shared between PWA and native)"

cd $REPO_ROOT/ui/web
yarn dev
