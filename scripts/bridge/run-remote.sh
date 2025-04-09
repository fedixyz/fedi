#!/usr/bin/env bash

# exit on failure
set -e

if [ -z "$FEDI_BRIDGE_REMOTE" ]
then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

BRIDGE_DATADIR="$CARGO_BUILD_TARGET_DIR/datadir"
cargo run --package fedi-rpc-server -- "$BRIDGE_DATADIR"
