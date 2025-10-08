#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "🧪 Running unit tests..."
env -C $REPO_ROOT/ui yarn test:unit
echo "✅ Unit tests completed successfully"
