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
