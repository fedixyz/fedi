#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

# whichever fedimint binary appears in path first will be used
if [ -n "${USE_UPSTREAM_FEDIMINTD:-}" ]; then
	export PATH="${UPSTREAM_FEDIMINTD_NIX_PKG}/bin:${CARGO_BIN_DIR}:$PATH"
else
	export PATH="${CARGO_BIN_DIR}:$PATH"
fi

export INCLUDE_STABILITY_POOL=1
export FEDI_STABILITY_POOL_MODULE_ENABLE=1
export FEDI_STABILITY_POOL_V2_MODULE_ENABLE=1
export USE_STABILITY_POOL_TEST_PARAMS=1
export FEDI_STABILITY_POOL_MODULE_TEST_PARAMS=1
export FEDI_SOCIAL_RECOVERY_MODULE_ENABLE=1
export RUST_BACKTRACE=0
export FM_ENABLE_MODULE_LNV2=1
export FM_DISABLE_BASE_FEES=1

# fedi packages
source scripts/test-common.sh ""
echo "Running in temporary directory $FM_TEST_DIR"

export FM_ADMIN_PASSWORD=p

echo "## Ensuring everything built"
cargo build --profile "${CARGO_PROFILE}" --all-targets
echo "## Running v2 bridge tests"
cargo nextest run -v --locked --cargo-profile "${CARGO_PROFILE}" -E 'package(fedi-ffi)' "$@"
echo "## Tests Passed"
