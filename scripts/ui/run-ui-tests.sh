#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

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
    echo "🧪 Running tests..."
    env -C $REPO_ROOT/ui yarn test
    echo "✅ Tests completed against existing remote bridge"
else
    echo "🚀 Starting remote bridge on random port & running tests..."
    $REPO_ROOT/scripts/bridge/run-remote.sh --with-devfed --port 0 env -C $REPO_ROOT/ui yarn test
    echo "Test run finished, remote bridge has been shutdown"
fi
