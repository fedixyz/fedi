#!/usr/bin/env bash
set -euo pipefail

# note: can't use --ignore-environment as it uses globally installed xcode
exec nix develop -L .#xcode --command env HOME="$HOME" BUILD_ALL_BRIDGE_TARGETS=1 CARGO_PROFILE=ci \
  scripts/ci/run-in-fs-dir-cache.sh build-bridge-ios ./scripts/bridge/build-and-check-ios.sh
