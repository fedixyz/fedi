#!/usr/bin/env bash
# Compile the binaries the dev fed runs on.

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
source "$REPO_ROOT/scripts/common.sh"
build_workspace

# install the built binaries for a separately-launched fed to run
# (copy just the programs, not cargo's build leftovers)
if [ -n "${DEVFED_BIN_DIR:-}" ]; then
  mkdir -p "$DEVFED_BIN_DIR"
  find "$CARGO_BIN_DIR" -maxdepth 1 -type f -perm -100 -exec cp -f {} "$DEVFED_BIN_DIR/" \;
fi
