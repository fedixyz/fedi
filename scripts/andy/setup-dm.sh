#!/usr/bin/env bash
# Reset both screens, onboard, create a DM via bridge API, then launch apps on chat tab.
# Uses default screen and ANDY_SCREEN=2.
set -euo pipefail

RBRIDGE_HOST="localhost:${REMOTE_BRIDGE_PORT:-26722}"

rpc() {
    local device_id="$1" method="$2" body="${3:-"{}"}"
    curl -s -X POST "http://${RBRIDGE_HOST}/${device_id}/rpc/${method}" \
        -H 'Content-Type: application/json' \
        -d "$body"
}

# Get screen info
PKG1=$(andy info | jq -r .assigned_package)
PKG2=$(andy --screen 2 info | jq -r .assigned_package)
DEVICE1="remote-bridge:pkg:${PKG1}"
DEVICE2="remote-bridge:pkg:${PKG2}"

echo "==> Onboarding both screens..."
bash scripts/andy/reset-and-onboard.sh --no-launch &
pid1=$!
ANDY_SCREEN=2 bash scripts/andy/reset-and-onboard.sh --no-launch &
pid2=$!
wait $pid1 $pid2

# Get user IDs and create DM via bridge API
USER1=$(rpc "$DEVICE1" matrixGetAccountSession '{"cached":false}' | jq -r .result.userId)
USER2=$(rpc "$DEVICE2" matrixGetAccountSession '{"cached":false}' | jq -r .result.userId)
ROOM_ID=$(rpc "$DEVICE1" matrixRoomCreateOrGetDm "{\"userId\":\"$USER2\"}" | jq -r .result)
rpc "$DEVICE1" matrixSendMessage "{\"roomId\":\"$ROOM_ID\",\"data\":{\"msgtype\":\"m.text\",\"body\":\"Hello from user 1!\",\"data\":{},\"mentions\":null}}" > /dev/null
echo "==> DM created: $USER1 -> $USER2 ($ROOM_ID)"

# Launch both apps, dismiss display name, navigate to chat tab
launch_and_navigate() {
    local screen_flag="${1:-}"
    andy $screen_flag launch
    if andy $screen_flag a11y 2>&1 | grep -qF "Continue"; then
        andy $screen_flag tap "Continue"
    fi
    andy $screen_flag tap 405,1793
    if andy $screen_flag a11y 2>&1 | grep -qF "Explore Now"; then
        andy $screen_flag tap "Explore Now"
    fi
}

echo "==> Launching apps..."
launch_and_navigate "" &
launch_and_navigate "--screen 2" &
wait

echo "==> DM setup complete!"
