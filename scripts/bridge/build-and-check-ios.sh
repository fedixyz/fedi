#!/usr/bin/env bash
set -euo pipefail

echo "::group::Build iOS bridge artifacts"
./scripts/bridge/build-bridge-ios.sh
echo "::endgroup::"
echo "::group::Check the iOS bridge does not trigger the Local Network prompt"
TIMEFORMAT="Local Network check: %3R seconds"
time ./scripts/bridge/check-ios-local-network-prompt.sh || exit $?
echo "::endgroup::"
