#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

export PATH="${CARGO_BIN_DIR}:$PATH"

own_dir="$(dirname "${BASH_SOURCE[0]}")"
source "${own_dir}/test-bridge-current.inner.sh" "$@"
