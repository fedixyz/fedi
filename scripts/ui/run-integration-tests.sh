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
    shift
fi

TEST_DIR="$REPO_ROOT/ui${WORKSPACE:+/$WORKSPACE}"
TEST_ARGS=(test:integration)
if [ "$#" -gt 0 ]; then
    TEST_ARGS+=(-- "$@")
fi
TEST_CMD=(yarn "${TEST_ARGS[@]}")

DEFAULT_REMOTE_BRIDGE_PORT=26722
# main.rs & remote-bridge.ts must both respect this port
export REMOTE_BRIDGE_PORT=${REMOTE_BRIDGE_PORT:-$DEFAULT_REMOTE_BRIDGE_PORT}

is_remote_bridge_running() {
    lsof -i:$DEFAULT_REMOTE_BRIDGE_PORT >/dev/null 2>&1
}

# Check if remote bridge is already running
# in development, it is better not to auto-kill remote bridge if we detect it
# in CI, this shouldn't happen and we should use a random port
if is_remote_bridge_running; then
    # assume whatever is running on port 26722 is the remote bridge
    echo "🔍 Remote bridge is already running on port $DEFAULT_REMOTE_BRIDGE_PORT..."
    echo "🧪 Running tests${WORKSPACE:+ for $WORKSPACE}..."
    env -C "$TEST_DIR" "${TEST_CMD[@]}"
    echo "✅ Tests completed against existing remote bridge"
else
    echo "🚀 Starting remote bridge on random port & running tests${WORKSPACE:+ for $WORKSPACE}..."
    "$REPO_ROOT/scripts/bridge/run-remote.sh" --with-devfed --port 0 env -C "$TEST_DIR" "${TEST_CMD[@]}"
    echo "Test run finished, remote bridge has been shutdown"
fi
