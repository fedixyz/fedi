#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export FM_DEVIMINT_DISABLE_MODULE_LNV2=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FEDI_SOCIAL_RECOVERY_MODULE_ENABLE=1
export RUST_BACKTRACE=0

# fedi packages
source scripts/test-common.sh ""
echo "Running in temporary directory $FM_TEST_DIR"

export FM_ADMIN_PASSWORD=p

echo "## Ensuring everything built"
cargo build --profile "${CARGO_PROFILE}" --all-targets
echo "## Running v2 bridge tests"
cargo nextest run -v --locked --cargo-profile "${CARGO_PROFILE}" -E 'package(fedi-ffi)' "$@"
echo "## Tests Passed"
