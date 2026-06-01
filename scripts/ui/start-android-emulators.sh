#!/usr/bin/env bash

set -e

if [ -z "$ANDROID_SDK_ROOT" ]; then
    echo "ERROR: ANDROID_SDK_ROOT not set. Run: nix develop"
    exit 1
fi

if [ -z "$APPIUM_HOME" ]; then
    echo "ERROR: APPIUM_HOME not set. Run: nix develop"
    exit 1
fi

echo "Using Android SDK at: $ANDROID_SDK_ROOT"

# Cleanup if interrupted to kill hanging adb processes
cleanup() {
    echo "Script interrupted, cleaning up hanging adb processes..."
    pkill -f "adb.*wait-for-device" 2>/dev/null || true
}
trap cleanup INT TERM

# makes sure the defined android virtual devices exist and can be booted
ARCH=$(uname -m)
case "$ARCH" in
    x86_64)        ABI="x86_64" ;;
    arm64|aarch64) ABI="arm64-v8a" ;;
    *) echo "ERROR: Unsupported architecture: $ARCH"; exit 1 ;;
esac
echo "Host architecture: $ARCH -> using ABI: $ABI"

declare -A AVD_CONFIGS
declare -A SCREEN_WIDTH
declare -A SCREEN_HEIGHT
declare -A SCREEN_DENSITY
# Two device sets, one picked per run:
#   single-actor: android-7.1 + android-14 cross-OS pair (CI) or android-14 alone (local)
#   multi-actor:  android-14-a + android-14-b clones, matching OS so one test drives both
AVD_CONFIGS["android-7.1"]="system-images;android-25;google_apis;${ABI}"
AVD_CONFIGS["android-14"]="system-images;android-34;google_apis;${ABI}"
AVD_CONFIGS["android-14-a"]="system-images;android-34;google_apis;${ABI}"
AVD_CONFIGS["android-14-b"]="system-images;android-34;google_apis;${ABI}"
SCREEN_WIDTH["android-7.1"]=720
SCREEN_HEIGHT["android-7.1"]=1280
SCREEN_DENSITY["android-7.1"]=320
SCREEN_WIDTH["android-14"]=1440
SCREEN_HEIGHT["android-14"]=3120
SCREEN_DENSITY["android-14"]=505
SCREEN_WIDTH["android-14-a"]=1440
SCREEN_HEIGHT["android-14-a"]=3120
SCREEN_DENSITY["android-14-a"]=505
SCREEN_WIDTH["android-14-b"]=1440
SCREEN_HEIGHT["android-14-b"]=3120
SCREEN_DENSITY["android-14-b"]=505

# Pick which set to boot from the actor count the selected tests require.
# count >= 2: same-OS clones so one test can drive both as actors a/b.
# count == 1: master's cross-OS pair in CI for OS coverage; just android-14 locally.
DEVICE_COUNT="${E2E_DEVICE_COUNT:-1}"
if ! [[ "$DEVICE_COUNT" =~ ^[0-9]+$ ]] || (( DEVICE_COUNT < 1 )); then
  echo "ERROR: E2E_DEVICE_COUNT='$DEVICE_COUNT' is not a positive integer"
  exit 1
fi
MAX_CLONES=2
if (( DEVICE_COUNT > MAX_CLONES )); then
  echo "ERROR: E2E_DEVICE_COUNT=$DEVICE_COUNT exceeds configured clones ($MAX_CLONES). Add more to AVD_CONFIGS/SCREEN_*."
  exit 1
fi
if (( DEVICE_COUNT >= 2 )); then
  ANDROID_DEVICES=("emulator-5554" "emulator-5556")
  AVD_NAMES=("android-14-a" "android-14-b")
elif [[ -n "${CI:-}" ]]; then
  ANDROID_DEVICES=("emulator-5554" "emulator-5556")
  AVD_NAMES=("android-7.1" "android-14")
else
  ANDROID_DEVICES=("emulator-5554")
  AVD_NAMES=("android-14")
fi
echo "Starting Android emulator(s) for count=$DEVICE_COUNT: ${AVD_NAMES[*]}"

# CI uses headless (-no-window) and wipes data for a clean run; local dev
# keeps a window and persists state. Orthogonal to device count.
if [[ -n "${CI:-}" ]]; then
  BOOT_OPTIONS="-no-audio -no-boot-anim -no-window -wipe-data"
else
  BOOT_OPTIONS="-no-audio -no-boot-anim"
fi

create_avd() {
    local avd_name="$1"
    local system_image="$2"
    local avd_path="$ANDROID_AVD_HOME/$avd_name"
    
    local width="${SCREEN_WIDTH[$avd_name]}"
    local height="${SCREEN_HEIGHT[$avd_name]}"
    local density="${SCREEN_DENSITY[$avd_name]}"
    
    echo "Creating AVD '$avd_name' with system image '$system_image' and screen size ${width}x${height}..."
    
    # echo "no" to skip the prompt to use a custom hardware profile
    echo "no" | avdmanager create avd \
        --force \
        --name "$avd_name" \
        --package "$system_image" \
        --path "$avd_path" \
        --tag "google_apis"

    if [ -f "$avd_path/config.ini" ]; then
        # Fix image paths
        # Before: image.sysdir.1=/nix/store/.../android-sdk/system-images/android-32/google_apis/arm64-v8a/
        # After:  image.sysdir.1=system-images/android-32/google_apis/arm64-v8a/
        sed -i.bak "s|^image\.sysdir\.1=.*system-images/|image.sysdir.1=system-images/|" "$avd_path/config.ini"
        
        # Set screen dimensions
        echo "hw.lcd.width=${width}" >> "$avd_path/config.ini"
        echo "hw.lcd.height=${height}" >> "$avd_path/config.ini"
        echo "hw.lcd.density=${density}" >> "$avd_path/config.ini"
        echo "skin.name=${width}x${height}" >> "$avd_path/config.ini"
        
        # Add keyboard support to test keyboard interactions
        echo "hw.keyboard=yes" >> "$avd_path/config.ini"
        echo "hw.dPad=yes" >> "$avd_path/config.ini"
        echo "hw.keyboard.lid=yes" >> "$avd_path/config.ini"
    fi
    
    echo "Successfully created AVD '$avd_name' with screen size ${width}x${height}"
}

# Start the emulators & store their pids (to kill them later)
start_and_wait_for_device() {
    local avd_name="$1"
    local device="$2"
    
    echo "Starting emulator '$avd_name' ($device)..."
    $ANDROID_HOME/emulator/emulator -avd "$avd_name" $BOOT_OPTIONS > "$APPIUM_HOME/emulator_${avd_name}.log" 2>&1 & echo $! >> "$APPIUM_HOME/android_emulator_pids.txt"
    
    sleep 10
    
    echo "Waiting for $device to connect..."
    timeout 120 adb -s $device wait-for-device || {
        echo "WARNING: Timed out waiting for $device to connect"
        return 1
    }
    
    echo "Waiting for $device to fully boot (timeout: 5 minutes)..."
    local boot_complete=false
    for attempt in {1..30}; do
        boot_completed=$(adb -s $device shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
        if [[ "$boot_completed" == "1" ]]; then
            echo "$device is fully booted after $((attempt * 10)) seconds"
            boot_complete=true
            break
        fi
        echo "Boot attempt $attempt: Device $device not ready yet, waiting 10 more seconds..."
        sleep 10
    done
    
    if [[ "$boot_complete" != "true" ]]; then
        echo "WARNING: Timed out after 5 minutes waiting for $device to boot"
        return 1
    fi
}

echo "Creating AVDs in: $ANDROID_AVD_HOME"
for avd_name in "${AVD_NAMES[@]}"; do
    system_image="${AVD_CONFIGS[$avd_name]}"
    create_avd "$avd_name" "$system_image"
done

adb devices
# Start emulators and wait for each to boot
for i in "${!AVD_NAMES[@]}"; do
    avd_name="${AVD_NAMES[$i]}"
    device="${ANDROID_DEVICES[$i]}"
    start_and_wait_for_device "$avd_name" "$device"
    cat "$APPIUM_HOME/emulator_${avd_name}.log"
done
echo "Running adb devices..."
adb devices
cat "$APPIUM_HOME/android_emulator_pids.txt"
