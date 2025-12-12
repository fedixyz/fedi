#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

# needs the compiled binaries in the PATH
PATH="$CARGO_BIN_DIR:$PATH"
which fedimintd

export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FEDI_SOCIAL_RECOVERY_MODULE_ENABLE=1
export FM_DISABLE_BASE_FEES=1
export RUST_BACKTRACE=full

# fedi packages
source scripts/test-common.sh ""
echo "Running in temporary directory $FM_TEST_DIR"

export FM_ADMIN_PASSWORD=p

echo "## Ensuring everything built"
cargo build --profile "${CARGO_PROFILE}" --all-targets
echo "## Running fedimint upstream test suite"
devi "$@"
echo "## Tests Passed"
