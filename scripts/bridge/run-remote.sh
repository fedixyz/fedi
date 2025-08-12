#!/usr/bin/env bash

# exit on failure
set -e

if [ -n "$FEDI_DISABLE_REMOTE_BRIDGE" ]
then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

source "$REPO_ROOT/scripts/common.sh"
build_workspace

# needs the compiled binaries in the PATH
export PATH="$CARGO_BIN_DIR:$PATH"

export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export FEDI_STABILITY_POOL_V2_MODULE_ENABLE=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FEDI_SOCIAL_RECOVERY_MODULE_ENABLE=1
export RUST_BACKTRACE=0
export FM_ENABLE_MODULE_LNV2=1

BRIDGE_DATADIR="$CARGO_BUILD_TARGET_DIR/datadir"
mkdir -p "$BRIDGE_DATADIR"
remote-server "$BRIDGE_DATADIR" "$@"
