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
            echo "Usage: $0 [common|native|web] [test-matcher]"
            exit 1
            ;;
    esac
    shift
fi

TEST_DIR="$REPO_ROOT/ui${WORKSPACE:+/$WORKSPACE}"
TEST_ARGS=(test:unit)
if [ "$#" -gt 0 ]; then
    TEST_ARGS+=(-- "$@")
fi
TEST_CMD=(yarn "${TEST_ARGS[@]}")

echo "🧪 Running unit tests${WORKSPACE:+ for $WORKSPACE}..."
env -C "$TEST_DIR" "${TEST_CMD[@]}"
echo "✅ Unit tests completed successfully"
