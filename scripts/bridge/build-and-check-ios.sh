#!/usr/bin/env bash
set -euo pipefail

TIMEFORMAT="iOS shell tests: %3R seconds"
time ./scripts/bridge/test-ios-network-check.sh || exit $?
exec ./scripts/bridge/build-bridge-ios.sh
