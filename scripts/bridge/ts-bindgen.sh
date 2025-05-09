#!/usr/bin/env bash

# exit on failure
set -e
# fixes the sort of globs in *.ts below
export LC_ALL=C

REPO_ROOT=$(git rev-parse --show-toplevel)
EXPORT_FILE="$REPO_ROOT/ui/common/types/bindings.ts"

$REPO_ROOT/scripts/enforce-nix.sh

BRIDGE_ROOT=$REPO_ROOT/bridge
cd $BRIDGE_ROOT

export TS_RS_EXPORT_DIR="$CARGO_BUILD_TARGET_DIR/bindings/"
mkdir -p "$TS_RS_EXPORT_DIR"
rm -f "$TS_RS_EXPORT_DIR"/*
cargo test -- export_bindings
cat $TS_RS_EXPORT_DIR/*.ts | sed '/^import /d; s://.*$::' | cat $EXPORT_FILE.inc - > $EXPORT_FILE
prettier --no-config --write $EXPORT_FILE
