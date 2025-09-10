#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "=== iOS e2e tests ==="

# Ensure Appium is running
bash "$REPO_ROOT/scripts/ui/setup-and-start-appium.sh"

# Function to extract device ID from a device string
extract_device_id() {
    echo "$1" | sed -n -E 's/.*\(([^)]+)\).*/\1/p'
}

while true; do
  devices=()
  # Select from booted simulators
  xcrunDevicesList=$(xcrun simctl list devices | grep "(Booted)" || true)
  while IFS= read -r line; do
      devices+=("$line")
  done < <(echo "$xcrunDevicesList" | grep -Eo '.*\([0-9A-Fa-f-]+\)')
  if [[ ${#devices[@]} -eq 0 ]]; then
    echo "No iOS simulators available."
    echo "You can create and boot new simulators using option 1 below."
  fi

  echo -e "\nChoose an option for running e2e iOS tests:"
  echo -e "\n\e[1;33m⚠️  WARNING: APP DATA WILL BE WIPED FROM THE SELECTED SIMULATOR!\e[0m"
  echo -e "\e[1;33m════════════════════════════════════════════════════════════\e[0m"
  echo "1) Create & boot new simulator (default)"
  echo "2) Refresh device list"
  for i in "${!devices[@]}"; do
    echo "$((i+3))) Select device: ${devices[$i]}"
  done

  read -p "Enter choice: " choice
  choice=${choice:-1}

  if [[ "$choice" == "1" ]]; then
    bash "$REPO_ROOT/scripts/ui/start-ios-simulators.sh"
    # Continue loop to reprompt after creating new simulator
    continue
  elif [[ "$choice" == "2" ]]; then
    echo "Refreshing device list..."
    continue
  elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 3 ] && [ "$choice" -le "$((${#devices[@]}+2))" ]; then
    selectedDevice=${devices[$((choice-3))]}
    DEVICE_ID=$(extract_device_id "$selectedDevice")
    break
  else
    echo "Invalid choice, using first available device"
    selectedDevice=${devices[0]}
    DEVICE_ID=$(extract_device_id "$selectedDevice")
    break
    # if [[ ${#devices[@]} -gt 0 ]]; then
    #   echo "Invalid choice, using first available device"
    #   selectedDevice=${devices[0]}
    #   DEVICE_ID=$(extract_device_id "$selectedDevice")
    #   break
    # else
    #   echo "No devices available. Please create a new simulator first."
    #   continue
    # fi
  fi
done
echo "You selected device: $selectedDevice"

# Use TESTS_TO_RUN if set by run-e2e.sh, otherwise prompt
if [[ -z "${TESTS_TO_RUN:-}" ]]; then
  echo "Which tests to run? (onboarding JoinLeaveFederation all)"
  read -r TESTS_TO_RUN
  TESTS_TO_RUN=${TESTS_TO_RUN:-all}
fi

echo "Uninstalling org.fedi.alpha (if present) to clear app data..."
xcrun simctl uninstall "$DEVICE_ID" org.fedi.alpha || {
    echo "App not currently installed, continuing..."
}

echo "Building iOS debug bundle..."
pushd "$REPO_ROOT/ui/native"
run_options="--extra-params ARCHS=arm64 --udid $DEVICE_ID --no-packager --verbose"
run_command="arch -arm64 npx react-native run-ios $run_options"
$run_command
popd

echo "Running tests: $TESTS_TO_RUN"
PLATFORM=ios DEVICE_ID="$DEVICE_ID" ts-node "$REPO_ROOT/ui/native/tests/appium/runner.ts" $TESTS_TO_RUN

