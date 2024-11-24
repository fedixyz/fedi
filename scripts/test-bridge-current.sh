#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

# whichever fedimint binary appears in path first will be used
if [ -n "${USE_UPSTREAM_FEDIMINTD:-}" ]; then
	export PATH="${UPSTREAM_FEDIMINTD_NIX_PKG}/bin:${CARGO_BIN_DIR}:$PATH"
else
	export PATH="${CARGO_BIN_DIR}:$PATH"
fi

own_dir="$(dirname "${BASH_SOURCE[0]}")"
source "${own_dir}/test-bridge-current.inner.sh" "$@"
