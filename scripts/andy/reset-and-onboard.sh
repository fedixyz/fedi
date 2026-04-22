#!/usr/bin/env bash
# Reset app data and complete onboarding on a single andy screen.
# Set ANDY_SCREEN env var to target a specific screen.
set -euo pipefail

RBRIDGE_HOST="localhost:${REMOTE_BRIDGE_PORT:-26722}"

# Get the assigned package for this screen
PACKAGE=$(andy info | jq -r '.assigned_package')
DEVICE_ID="remote-bridge:pkg:${PACKAGE}"

# Reset app data on device
andy reset

# Shut down remote bridge state for this device if needed
curl -sS --fail-with-body -X POST "http://${RBRIDGE_HOST}/${DEVICE_ID}/shutdown" > /dev/null

# Reset remote bridge state for this device
curl -sS --fail-with-body -X POST "http://${RBRIDGE_HOST}/${DEVICE_ID}/reset" > /dev/null

# Initialize bridge and complete onboarding via bridge API
curl -s --fail-with-body -X POST "http://${RBRIDGE_HOST}/${DEVICE_ID}/init" \
    -H 'Content-Type: application/json' \
    -d "{\"dataDir\":\"/remote-data\",\"deviceIdentifier\":\"${DEVICE_ID}\",\"logLevel\":\"info\",\"appFlavor\":{\"type\":\"tests\"}}" > /dev/null

curl -s --fail-with-body -X POST "http://${RBRIDGE_HOST}/${DEVICE_ID}/rpc/completeOnboardingNewSeed" \
    -H 'Content-Type: application/json' \
    -d '{}' > /dev/null

# Force AOT compilation for faster app startup
adb shell cmd package compile -m speed -f "$PACKAGE" > /dev/null

# Grant notification permission before launch to avoid dialog
adb shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS

# Launch the app unless --no-launch is passed
if [[ "${1:-}" != "--no-launch" ]]; then
    andy launch
fi

echo "Onboarding complete."
