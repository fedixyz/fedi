# shellcheck shell=bash
# this script should be sourced, not ran directly
export REPO_ROOT


if command -v git &> /dev/null; then
  REPO_ROOT="$(git rev-parse --show-toplevel)"
else
  REPO_ROOT="$PWD"
fi

if [ -z "${CARGO_PROFILE:-}" ]; then
  export CARGO_PROFILE="dev"
fi

if [ "$CARGO_PROFILE" = "dev" ]; then
  export CARGO_PROFILE_DIR="debug"
else
  export CARGO_PROFILE_DIR="$CARGO_PROFILE"
fi

# This is what you get:
# REPO_ROOT
# CARGO_PROFILE
# CARGO_PROFILE_DIR
export CARGO_BUILD_TARGET_DIR="${CARGO_BUILD_TARGET_DIR:-${REPO_ROOT}/target}"
export CARGO_BIN_DIR="${CARGO_BUILD_TARGET_DIR}/${CARGO_PROFILE_DIR}"

function build_workspace() {
  echo "## Ensuring everything built"
  cargo build --profile "${CARGO_PROFILE}" --all-targets
}

# Select the module generation for any federation this script starts.
#
# Fedi does not support mixed federations: one carries either the v1 module
# set (mint + wallet + lnv1) or the v2 set (mintv2 + walletv2 + lnv2), never
# both. Anything that starts a federation must call this.
#
# Every flag is set, including the ones that already match fedimintd's
# defaults. Those defaults are not stable across fedimint versions -- upstream
# 4d4858f240e flipped them from the v1 set to the v2 set -- so a flag left
# unset makes the federation's shape a function of the pinned rev rather than
# of what the caller asked for.
function select_federation_modules() {
  case "${1:-one}" in
  one)
    export FM_ENABLE_MODULE_MINT=1
    export FM_ENABLE_MODULE_WALLET=1
    export FM_ENABLE_MODULE_LNV1=1
    export FM_ENABLE_MODULE_MINTV2=0
    export FM_ENABLE_MODULE_WALLETV2=0
    export FM_ENABLE_MODULE_LNV2=0
    ;;
  two)
    export FM_ENABLE_MODULE_MINT=0
    export FM_ENABLE_MODULE_WALLET=0
    export FM_ENABLE_MODULE_LNV1=0
    export FM_ENABLE_MODULE_MINTV2=1
    export FM_ENABLE_MODULE_WALLETV2=1
    export FM_ENABLE_MODULE_LNV2=1
    ;;
  *)
    echo "invalid federation kind '$1' (expected 'one' or 'two')" >&2
    return 1
    ;;
  esac
}
