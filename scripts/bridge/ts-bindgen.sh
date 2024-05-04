#!/usr/bin/env bash

# exit on failure
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
EXPORT_FILE="$REPO_ROOT/ui/common/types/bindings.ts"

$REPO_ROOT/scripts/enforce-nix.sh

BRIDGE_ROOT=$REPO_ROOT/bridge
cd $BRIDGE_ROOT

rm -f $BRIDGE_ROOT/fedi-ffi/target/bindings/*.ts
cargo test -- export_bindings
# concat all .ts files, remove imports, remove comments, add bindings.ts.inc at top
cat $BRIDGE_ROOT/fedi-ffi/target/bindings/*.ts | sed '/^import /d; s://.*$::' | cat $EXPORT_FILE.inc - > $EXPORT_FILE
prettier --write $EXPORT_FILE
