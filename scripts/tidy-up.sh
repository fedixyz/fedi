#!/usr/bin/env bash
set -euo pipefail

source scripts/common.sh

# save the build target dir that caller is actually supposed to use
default_target="$CARGO_BUILD_TARGET_DIR"

# we are going to build everything to a different target
export CARGO_BUILD_TARGET_DIR="$REPO_ROOT/target-tidy"

# wipe the temporary target, but don't delete it directly - might be a symlink
mkdir -p "$CARGO_BUILD_TARGET_DIR"
rm -Rf "CARGO_BUILD_TARGET_DIR/"

# build stuff we want ready
nice -n 20 just build
nice -n 20 just build-wasm

# do a quick switcharoo
rm -Rf "${default_target:?}"/*
mv "${CARGO_BUILD_TARGET_DIR}"/* "$default_target/"
