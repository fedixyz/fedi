#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

WORKSPACE="${1:-}"
if [ -n "$WORKSPACE" ]; then
    case "$WORKSPACE" in
        common|native|web) ;;
        *)
            echo "❌ Unknown workspace: $WORKSPACE"
            echo "Usage: $0 [common|native|web]"
            exit 1
            ;;
    esac
fi

TEST_DIR="$REPO_ROOT/ui${WORKSPACE:+/$WORKSPACE}"

echo "🧪 Running unit tests${WORKSPACE:+ for $WORKSPACE}..."
env -C "$TEST_DIR" yarn test:unit
echo "✅ Unit tests completed successfully"
