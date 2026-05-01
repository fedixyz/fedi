#!/usr/bin/env bash

set -e
"$REPO_ROOT/scripts/enforce-nix.sh"

# this script builds wasm for UI development using cached nix artifacts
WASM_BUILD_PROFILE=${WASM_BUILD_PROFILE:-dev}

echo "Installing wasm UI dependencies..."

# Default `nix build` writes a `./result` symlink in cwd that concurrent
# nix builds from the same cwd clobber. Use the store path directly.
WASM_OUT=$(nix build -L --no-link --print-out-paths \
    ".#wasm32-unknown.${WASM_BUILD_PROFILE}.fedi-wasm-pack")
cp -f "$WASM_OUT/share/wasm/"* "$REPO_ROOT/ui/common/wasm/"

echo "Installed wasm UI dependencies in $REPO_ROOT/ui/common/wasm/"
