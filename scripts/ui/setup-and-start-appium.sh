#!/usr/bin/env bash

set -euo pipefail

echo "Checking for Appium server..."
APPIUM_PID=""
while IFS= read -r line; do
  pid=$(echo "$line" | awk '{print $1}')
  comm=$(echo "$line" | awk '{print $2}')
  args=$(echo "$line" | cut -d' ' -f3-)

  if [[ "$comm" != "node" && "$comm" != "appium" ]]; then
    continue
  fi

  if [[ "$args" != *"appium"* ]]; then
    continue
  fi

  if [[ "$args" == *"appium-webdriveragent"* || "$args" == *"appium-xcuitest-driver"* ]]; then
    continue
  fi

  APPIUM_PID="$pid"
  break
done < <(ps -axo pid=,comm=,args= | grep appium || true)

if [[ -n "$APPIUM_PID" ]]; then
  APPIUM_PORT=$(lsof -Pan -p "$APPIUM_PID" -a -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {split($9,a,":"); print a[2]}' | head -1 || true)
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

# PLATFORM=android|ios|both. iOS driver setup pulls in `nix develop .#xcode`,
# so scoping out iOS on Android runs avoids unnecessary nix-eval contention.
PLATFORM_TARGET="${PLATFORM:-both}"
DO_ANDROID=1
DO_IOS=1
case "$PLATFORM_TARGET" in
  android) DO_IOS=0 ;;
  ios)     DO_ANDROID=0 ;;
esac

DRIVER_LIST_FILE=$(mktemp)
appium driver list --installed >"$DRIVER_LIST_FILE" 2>&1 || true

ANDROID_DRIVER_READY=0
IOS_DRIVER_READY=0

if [[ "$DO_ANDROID" == "1" ]]; then
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
fi

if [[ "$DO_IOS" == "1" ]]; then
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
  # Caller must already be inside `nix develop .#xcode` for iOS.
  if ! appium driver doctor xcuitest; then
    echo "❌ XCUITest driver doctor failed"
  else
    echo "✓ XCUITest driver doctor reported no critical issues"
    IOS_DRIVER_READY=1
  fi
fi

rm -f "$DRIVER_LIST_FILE"
echo "Final installed drivers:"
appium driver list --installed

if [[ "$DO_ANDROID" == "1" && "$DO_IOS" == "1" ]]; then
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
elif [[ "$DO_ANDROID" == "1" && "$ANDROID_DRIVER_READY" != "1" ]]; then
  echo "❌ Android driver setup failed"
  exit 1
elif [[ "$DO_IOS" == "1" && "$IOS_DRIVER_READY" != "1" ]]; then
  echo "❌ iOS driver setup failed"
  exit 1
fi

export IOS_DRIVER_READY
export ANDROID_DRIVER_READY

PID_FILE="$APPIUM_HOME/appium_pid.txt"
LOG_FILE="$APPIUM_HOME/appium.log"

if [[ "${PROMPT:-}" == "true" ]]; then
  echo "=== Starting Appium server in foreground ==="
  exec env -u MACOSX_DEPLOYMENT_TARGET appium
fi

# appium-ios-simulator needs `open` to launch Simulator.app, but /usr/bin
# isn't in the nix PATH. Symlink it into a directory that IS on PATH.
if [[ "$OSTYPE" == "darwin"* ]] && ! command -v open &>/dev/null && [[ -x /usr/bin/open ]]; then
  LINK_DIR="$APPIUM_HOME/bin"
  mkdir -p "$LINK_DIR"
  ln -sf /usr/bin/open "$LINK_DIR/open"
  export PATH="$LINK_DIR:$PATH"
  echo "Symlinked /usr/bin/open -> $LINK_DIR/open"
fi

echo "=== Starting Appium server in background ==="
# Retry across ports to tolerate cross-runner port conflicts on shared hosts.
APP_PORT=""
for attempt in 1 2 3; do
  APPIUM_PORT=$((4722 + attempt))
  echo "--- attempt $attempt: port $APPIUM_PORT ---"
  lsof -ti:"$APPIUM_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true
  [[ $attempt -gt 1 ]] && sleep 2

  ATTEMPT_LOG="$APPIUM_HOME/appium-attempt-${attempt}.log"
  if [[ "${DEBUG_MODE:-}" == "1" ]]; then
    APPIUM_LOG_LEVEL="debug"
  else
    APPIUM_LOG_LEVEL="info"
  fi
  nohup env -u MACOSX_DEPLOYMENT_TARGET appium --port "$APPIUM_PORT" \
    --log-level "$APPIUM_LOG_LEVEL" \
    >"$ATTEMPT_LOG" 2>&1 </dev/null &
  APP_PID=$!
  echo "$APP_PID" >"$PID_FILE"
  cp "$ATTEMPT_LOG" "$LOG_FILE" 2>/dev/null || true

  for _ in $(seq 1 80); do
    if ! kill -0 "$APP_PID" 2>/dev/null; then break; fi
    APP_PORT=$(lsof -Pan -p "$APP_PID" -a -iTCP -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {split($9,a,":"); print a[2]}' | head -1 || true)
    if [[ -n "$APP_PORT" ]]; then break; fi
    sleep 0.5
  done

  if [[ -n "$APP_PORT" ]]; then
    echo "Appium started (PID=$APP_PID, port=$APP_PORT)"
    echo "$APP_PORT" >"$APPIUM_HOME/appium_port.txt"
    break
  fi

  if ! kill -0 "$APP_PID" 2>/dev/null; then
    echo "⚠️  attempt $attempt: appium died. Log:"
    cat "$ATTEMPT_LOG" 2>/dev/null || true
  else
    echo "⚠️  attempt $attempt: appium alive but no port bound after 40s. Log:"
    tail -40 "$ATTEMPT_LOG" 2>/dev/null || true
  fi
  kill -9 "$APP_PID" 2>/dev/null || true
done

if [[ -z "$APP_PORT" ]]; then
  echo "❌ Appium failed to start after 3 attempts"
  exit 1
fi
