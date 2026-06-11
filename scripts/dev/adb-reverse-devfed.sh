#!/usr/bin/env bash
#
# Maps a running dev fed's ports into an android emulator/device so the app
# can reach the fed at the same 127.0.0.1 addresses the fed advertises.
# The fed binds to the host's loopback, which android cannot see; adb reverse
# forwards each device-local port back to the host.
#
# Usage:
#   scripts/dev/adb-reverse-devfed.sh <adb-serial> [<adb-serial> ...]
#
# Requires a fed started via scripts/bridge/run-remote.sh --with-devfed
# (REMOTE_BRIDGE_PORT must be set, as run-remote.sh does for its child).

set -euo pipefail

if [ $# -lt 1 ]; then
    echo "usage: $0 <adb-serial> [<adb-serial> ...]" >&2
    exit 1
fi
if [ -z "${REMOTE_BRIDGE_PORT:-}" ]; then
    echo "REMOTE_BRIDGE_PORT is unset; start the fed via run-remote.sh --with-devfed" >&2
    exit 1
fi

ports=$(curl -sf "http://127.0.0.1:${REMOTE_BRIDGE_PORT}/ports" | jq -r '.ports[]')

for serial in "$@"; do
    for port in $ports; do
        adb -s "$serial" reverse "tcp:$port" "tcp:$port"
    done
    echo "reversed $(echo "$ports" | wc -w | tr -d ' ') ports into $serial"
done
