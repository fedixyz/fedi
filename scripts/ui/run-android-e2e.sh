#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

echo "=== Android e2e tests ==="

# Ensure Appium is running
bash "$REPO_ROOT/scripts/ui/setup-and-start-appium.sh"

while true; do
  device_ids=()
  while IFS= read -r line; do
      device_ids+=("$line")
  done < <(adb devices | awk 'NR>1 && $2=="device" {print $1}')
  if [[ ${#device_ids[@]} -eq 0 ]]; then
    echo "No Android devices available."
    exit 1
  fi

  echo -e "\nChoose an option for running e2e Android tests:"
  echo -e "\n\e[1;33m⚠️  WARNING: APP DATA WILL BE WIPED FROM THE SELECTED DEVICE!\e[0m"
  echo -e "\e[1;33m════════════════════════════════════════════════════════════\e[0m"
  echo "1) Create & boot new emulator (default)"
  echo "2) Refresh device list"
  for i in "${!device_ids[@]}"; do
    echo "$((i+3))) Select device: ${device_ids[$i]}"
  done

  read -p "Enter choice: " choice
  choice=${choice:-1}

  if [[ "$choice" == "1" ]]; then
    bash "$REPO_ROOT/scripts/ui/start-android-emulators.sh"
    # Continue loop to reprompt after creating new emulator
    continue
  elif [[ "$choice" == "2" ]]; then
    echo "Refreshing device list..."
    continue
  elif [[ "$choice" =~ ^[0-9]+$ ]] && [ "$choice" -ge 3 ] && [ "$choice" -le "$((${#device_ids[@]}+2))" ]; then
    DEVICE_ID=${device_ids[$((choice-3))]}
    break
  else
    echo "Invalid choice, using first device"
    DEVICE_ID=${device_ids[0]}
    break
  fi
done

# Use TESTS_TO_RUN if set by run-e2e.sh, otherwise prompt
if [[ -z "${TESTS_TO_RUN:-}" ]]; then
  echo "Which tests to run? (onboarding JoinLeaveFederation all)"
  read -r TESTS_TO_RUN
  TESTS_TO_RUN=${TESTS_TO_RUN:-all}
fi

echo "Building APK..."
pushd "$REPO_ROOT/ui/native/android"
./gradlew assembleProductionDebug -Pandroid.injected.testOnly=false
APK_PATH=$(find ~+ ./app/build/outputs/apk/production/debug -name "*.apk" | head -1)
if [[ ! -f "$APK_PATH" ]]; then
  echo "APK not found after build!"
  exit 1
fi
popd

echo "Installing APK on $DEVICE_ID..."
adb -s "$DEVICE_ID" install -r "$APK_PATH" || true

APP_ID=$(grep applicationId "$REPO_ROOT/ui/native/android/app/build.gradle" | head -1 | awk -F '"' '{print $2}')
if [[ -z "$APP_ID" ]]; then
  echo "Could not extract applicationId from build.gradle."
  exit 1
fi

echo "Clearing app data for testing..."
adb -s "$DEVICE_ID" shell pm clear "$APP_ID" || {
    echo "Warning: Could not clear app data. Tests may fail."
}
adb -s "$DEVICE_ID" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 || {
    echo "APK launch failed."
    exit 1
}

echo "Running tests: $TESTS_TO_RUN"
PLATFORM=android DEVICE_ID="$DEVICE_ID" BUNDLE_PATH="$APK_PATH" ts-node "$REPO_ROOT/ui/native/tests/appium/runner.ts" $TESTS_TO_RUN


