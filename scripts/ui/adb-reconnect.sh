#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

# Sets up adb reverse port forwarding to Metro for all connected Android devices.

METRO_PORT=${METRO_PORT:-8081}

device_ids=()
while IFS= read -r line; do
    device_ids+=("$line")
done < <(adb devices | grep "device$" | awk '{print $1}')

if [[ ${#device_ids[@]} -eq 0 ]]; then
    echo "No Android devices found."
    exit 0
fi

echo "Setting up adb reverse tcp:$METRO_PORT for ${#device_ids[@]} device(s)..."

failures=0
for device_id in "${device_ids[@]}"; do
    if adb -s "$device_id" reverse tcp:"$METRO_PORT" tcp:"$METRO_PORT" 2>/dev/null; then
        echo -e "  \x1B[32;1m✓\x1B[0m $device_id"
    else
        echo -e "  \x1B[31;1m✗\x1B[0m $device_id - failed"
        ((failures++))
    fi
done

if [[ $failures -gt 0 ]]; then
    echo -e "\x1B[33;1m$failures device(s) failed to reconnect\x1B[0m"
    exit 1
fi

echo -e "\x1B[32;1mAll devices reconnected to Metro on port $METRO_PORT\x1B[0m"
