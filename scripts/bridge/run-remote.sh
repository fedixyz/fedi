#!/usr/bin/env bash

# exit on failure
set -e

if [ -z "$FEDI_BRIDGE_REMOTE" ]
then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

source "$REPO_ROOT/scripts/common.sh"
build_workspace

# needs the compiled binaries in the PATH
export PATH="$CARGO_BIN_DIR:$PATH"

BRIDGE_DATADIR="$CARGO_BUILD_TARGET_DIR/datadir"
mkdir -p "$BRIDGE_DATADIR"
remote-server "$BRIDGE_DATADIR"
