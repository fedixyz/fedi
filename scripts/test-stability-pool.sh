#!/usr/bin/env bash
# Verifies printing money via the dummy module

set -euo pipefail

source scripts/common.sh
source scripts/test-common.sh

export RUST_LOG="${RUST_LOG:-info}"
export RUST_BACKTRACE=1
export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FM_DISABLE_BASE_FEES=1

build_workspace

# needs the compiled binaries in the PATH
PATH="$CARGO_BIN_DIR:$PATH"
which fedimintd

# symlink logs to local gitignored directory so they're easier to find
mkdir -p "$CARGO_BUILD_TARGET_DIR"
rm "$CARGO_BUILD_TARGET_DIR/logs" || true
ln -s "$FM_LOGS_DIR" "$CARGO_BUILD_TARGET_DIR/logs" || true
rm "$CARGO_BUILD_TARGET_DIR/test"|| true
ln -s "$FM_TEST_DIR" "$CARGO_BUILD_TARGET_DIR/test" || true

cargo nextest run --cargo-profile "${CARGO_PROFILE}" --profile "${CARGO_PROFILE}" -E 'package(stability-pool-tests-old)'
