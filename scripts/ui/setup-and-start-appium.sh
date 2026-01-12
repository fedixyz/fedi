#!/usr/bin/env bash

set -euo pipefail

echo "Checking for Appium server..."
APPIUM_PID=$(pgrep -f "node.*appium" | head -1 || true)

if [[ -n "$APPIUM_PID" ]]; then
  APPIUM_PORT=$(lsof -p "$APPIUM_PID" -i TCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {split($9,a,":"); print a[2]}' | head -1 || true)
  if [[ -n "$APPIUM_PORT" ]]; then
    echo "✓ Appium server found - PID: $APPIUM_PID, Port: $APPIUM_PORT"
  else
    echo "✓ Appium server found - PID: $APPIUM_PID (port detection failed)"
  fi
  echo "Appium already running, no setup needed."
  exit 0
else
  echo "✗ Appium server not running"
fi

# Optional prompt mode when running from run-dev-ui mprocs
if [[ "${PROMPT:-}" == "true" ]]; then
  while true; do
    read -p "Start Appium server now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      break
    else
      echo "Appium not started. Press 'y' to start when ready."
    fi
  done
fi

# ensure Appium 2.x exists, required drivers are installed,
# then start the server in the background and store its PID.

echo "=== Ensuring Appium is installed & drivers are up to date ==="
if ! command -v appium >/dev/null 2>&1; then
  echo "Appium is not installed or not on PATH. Make sure you are in a nix shell and have run scripts/ui/build-deps.sh first."
  exit 1
fi

check_version() {
    local current_version=$1
    local required_major=$2
    local major_version
    major_version=$(echo "$current_version" | cut -d. -f1)
    if [[ "$major_version" == "$required_major" ]]; then
        return 0
    else
        return 1
    fi
}
appium_version=$(appium --version 2>&1 | tail -n1)
echo "Using appium: $(command -v appium)"
echo "Appium version: $appium_version"
echo "APPIUM_HOME: ${APPIUM_HOME:-unset}"

if ! check_version "$appium_version" "3"; then
    echo "❌ Appium version 3.x is required, but found version $appium_version"
    exit 1
else
    echo "✓ Appium 3.x is installed"
fi

DRIVER_LIST_FILE=$(mktemp)
appium driver list --installed >"$DRIVER_LIST_FILE" 2>&1 || true

ANDROID_DRIVER_READY=0
IOS_DRIVER_READY=0

echo "=== Setting up Android driver ==="
android_driver_output=$(grep -i uiautomator2 "$DRIVER_LIST_FILE" || echo "")
if [[ -n "$android_driver_output" ]]; then
  android_version=$(echo "$android_driver_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  if check_version "$android_version" "5"; then
    echo "✓ UiAutomator2 driver $android_version is correct version"
  else
    echo "❌ UiAutomator2 driver version $android_version is wrong, need 5.x"
    if appium driver uninstall uiautomator2 && appium driver install uiautomator2@5; then
      echo "✓ Installed UiAutomator2 driver 5.x"
    else
      echo "❌ Failed to install UiAutomator2 driver"
    fi
  fi
else
  if appium driver install uiautomator2@5; then
    echo "✓ Installed UiAutomator2 driver"
  else
    echo "❌ Failed to install UiAutomator2 driver"
  fi
fi

echo "Running UiAutomator2 driver doctor..."
if ! appium driver doctor uiautomator2; then
  echo "❌ UiAutomator2 driver doctor failed"
else
  echo "✓ UiAutomator2 driver doctor reported no critical issues"
  ANDROID_DRIVER_READY=1
fi

echo "=== Setting up iOS driver ==="
ios_driver_output=$(grep -i xcuitest "$DRIVER_LIST_FILE" || echo "")
if [[ -n "$ios_driver_output" ]]; then
  ios_version=$(echo "$ios_driver_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
  if check_version "$ios_version" "10"; then
    echo "✓ XCUITest driver $ios_version is correct version"
  else
    echo "❌ XCUITest driver version $ios_version is wrong, need 10.x"
    if appium driver uninstall xcuitest && appium driver install xcuitest; then
      echo "✓ Installed XCUITest driver"
    else
      echo "❌ Failed to install XCUITest driver"
    fi
  fi
else
  if appium driver install xcuitest; then
    echo "✓ Installed XCUITest driver"
  else
    echo "❌ Failed to install XCUITest driver"
  fi
fi

echo "Running XCUITest driver doctor..."
if ! nix develop .#xcode --command appium driver doctor xcuitest; then
  echo "❌ XCUITest driver doctor failed"
else
  echo "✓ XCUITest driver doctor reported no critical issues"
  IOS_DRIVER_READY=1
fi

rm -f "$DRIVER_LIST_FILE"
echo "Final installed drivers:"
appium driver list --installed

if [[ "$ANDROID_DRIVER_READY" == "0" && "$IOS_DRIVER_READY" == "0" ]]; then
    echo "❌ Android and iOS driver installations failed - cannot proceed"
    exit 1
elif [[ "$ANDROID_DRIVER_READY" == "0" ]]; then
    echo "⚠️ Android driver installation failed... proceeding with iOS only"
elif [[ "$IOS_DRIVER_READY" == "0" ]]; then
    echo "⚠️ iOS driver installation failed... proceeding with Android only"
else
    echo "✓ All Appium drivers are ready"
fi

export IOS_DRIVER_READY
export ANDROID_DRIVER_READY

PID_FILE="$APPIUM_HOME/appium_pid.txt"
LOG_FILE="$APPIUM_HOME/appium.log"

if [[ "${PROMPT:-}" == "true" ]]; then
  # PROMPT mode: run in foreground so logs appear in the terminal
  echo "=== Starting Appium server in foreground ==="
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    appium
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    nix develop .#xcode --command env -u MACOSX_DEPLOYMENT_TARGET appium
  fi
else
  # otherwise run in background and write PID/log file
  echo "=== Starting Appium server in background ==="
  if [[ "$OSTYPE" == "linux-gnu"* ]]; then
    appium >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  elif [[ "$OSTYPE" == "darwin"* ]]; then
    nix develop .#xcode --command env -u MACOSX_DEPLOYMENT_TARGET appium >"$LOG_FILE" 2>&1 &
    echo $! >"$PID_FILE"
  fi
  sleep 2
  echo "Appium started. PID=$(cat "$PID_FILE") | Logs: $LOG_FILE"
fi
