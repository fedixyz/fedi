#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FEDI_SOCIAL_RECOVERY_MODULE_ENABLE=1
export RUST_BACKTRACE=full

# fedi packages
source scripts/build.sh ""
echo "Running in temporary directory $FM_TEST_DIR"

export FM_ADMIN_PASSWORD=p

function run_tests() {
    FM_INVITE_CODE=$(cat $FM_CLIENT_DIR/invite-code)
    export FM_INVITE_CODE
    cargo nextest run -v --locked --cargo-profile "${CARGO_PROFILE}" -E 'package(fedi-ffi)' -- "$@"
}
export -f run_tests

echo "## Running v2 bridge tests"
devi dev-fed --exec bash -c run_tests
echo "## Tests Passed"
