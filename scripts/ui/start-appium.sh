#!/usr/bin/env bash

set -e

if [[ "$RUN_TESTS" == "0" ]]; then
    echo "Running tests was skipped"
    exit 0
fi

# $REPO_ROOT/scripts/enforce-nix.sh
# skipping enforcing nix because nix has some weirdness with `xcode-select -p`
# Start Appium server
echo "=== Starting Appium server ==="
if command -v appium &> /dev/null; then
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        appium
        exit $?
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        nix develop .#xcode --command env -u MACOSX_DEPLOYMENT_TARGET appium
        exit $?
    fi
else
    echo "Cannot start Appium - not installed"
    exit 1
fi
