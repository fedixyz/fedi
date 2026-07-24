#!/usr/bin/env bash
# Bridge tests against a kind-two federation: v2 modules only
# (mintv2 + walletv2 + lnv2).
set -euo pipefail

FEDI_FEDERATION_KIND=two exec ./scripts/test-bridge.sh "$@"
