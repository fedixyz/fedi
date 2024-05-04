#!/usr/bin/env bash

set -e
"$REPO_ROOT/scripts/enforce-nix.sh"

# this script builds wasm for UI development using cached nix artifacts
WASM_BUILD_PROFILE=${WASM_BUILD_PROFILE:-dev}

echo "Installing wasm UI dependencies..."

# make sure we are in the repo root when we build fedi-wasm-pack so /result
# gets copied in the correct directory
pushd "$REPO_ROOT"
nix build -L ".#wasm32-unknown.${WASM_BUILD_PROFILE}.fedi-wasm-pack"
cp -f "$REPO_ROOT/result/share/wasm/"* "$REPO_ROOT/ui/common/wasm/"
popd

echo "Installed wasm UI dependencies in $REPO_ROOT/ui/common/wasm/"
