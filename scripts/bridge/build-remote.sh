#!/usr/bin/env bash
# Compile the binaries the dev fed runs on.

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
source "$REPO_ROOT/scripts/common.sh"
build_workspace
