#!/usr/bin/env bash

source ./script/test-common.sh

# Builds the rust executables and sets environment variables
SRC_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )/.." &> /dev/null && pwd )"
cd $SRC_DIR || exit 1

# Compile binaries in a way that nix can cache
cargo build --profile "${CARGO_PROFILE}"
