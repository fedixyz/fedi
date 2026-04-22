#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

NUM_APPS=${1:-4}

if [[ "$NUM_APPS" -lt 1 || "$NUM_APPS" -gt 99 ]]; then
    echo "Usage: $0 [NUM_APPS]"
    echo "  NUM_APPS: number of dev apps to install (1-99, default: 4)"
    exit 1
fi

$REPO_ROOT/scripts/enforce-nix.sh

DEVICE_ID_FILE="/tmp/selected_android_device_id"

echo "Detecting connected Android devices..."
mapfile -t all_device_ids < <(adb devices | grep -v "List" | grep -v "^$" | awk '{print $1}')

if [[ ${#all_device_ids[@]} -eq 0 ]]; then
    echo "No Android devices found. Please connect a device or launch an emulator."
    exit 1
fi

devices=()
device_ids=()

for device_id in "${all_device_ids[@]}"; do
    if [[ -z "$device_id" ]]; then
        continue
    fi
    device_ids+=("$device_id")
    model=$(adb -s "$device_id" shell getprop ro.product.model 2>/dev/null | tr -d '\r\n')
    android_version=$(adb -s "$device_id" shell getprop ro.build.version.release 2>/dev/null | tr -d '\r\n')
    if [[ -n "$model" && -n "$android_version" ]]; then
        devices+=("$model (Android $android_version) ($device_id)")
    elif [[ -n "$model" ]]; then
        devices+=("$model ($device_id)")
    else
        if [[ "$device_id" == emulator* ]]; then
            devices+=("Emulator ($device_id)")
        else
            devices+=("Device ($device_id)")
        fi
    fi
done

selectedDevice=""
FEDI_DEVICE_ID=""

if [[ -f "$DEVICE_ID_FILE" ]]; then
    last_selected_device_id=$(cat "$DEVICE_ID_FILE")
    for i in "${!device_ids[@]}"; do
        if [[ "${device_ids[$i]}" == "$last_selected_device_id" ]]; then
            selectedDevice="${devices[$i]}"
            FEDI_DEVICE_ID="${device_ids[$i]}"
            break
        fi
    done
    if [[ -n "$selectedDevice" ]]; then
        echo "Using last selected device: $selectedDevice"
        echo "Press ENTER to confirm or type 'n' to pick another (auto-confirms in 10s)..."
        if read -t 10 user_choice; then
            user_choice=${user_choice:-Y}
        else
            user_choice="Y"
        fi
        if [[ "$user_choice" =~ ^[Nn]$ ]]; then
            selectedDevice=""
            FEDI_DEVICE_ID=""
        fi
    fi
fi

if [[ -z "$selectedDevice" ]]; then
    echo "Select a device:"
    for i in "${!devices[@]}"; do
        echo "$((i+1))) ${devices[$i]}"
    done
    read -p "Enter choice (default: 1): " choice
    choice=${choice:-1}
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt "${#devices[@]}" ]; then
        echo "Invalid choice, defaulting to 1"
        choice=1
    fi
    selectedDevice=${devices[$((choice-1))]}
    FEDI_DEVICE_ID=${device_ids[$((choice-1))]}
fi

echo "$FEDI_DEVICE_ID" > "$DEVICE_ID_FILE"
echo "Target device: $selectedDevice"

pushd "$REPO_ROOT/ui/native/android" > /dev/null

failed=()
for i in $(seq -w 1 "$NUM_APPS"); do
    dev_id=$(printf "%02d" "$((10#$i))")
    echo ""
    echo "=== Building dev${dev_id} ($i/$NUM_APPS) ==="
    if ./gradlew assembleDevDebug -PdevId="$dev_id" -Pandroid.injected.testOnly=false; then
        APK_PATH=$(find ./app/build/outputs/apk/dev/debug -name "*.apk" | head -1)
        if [[ -f "$APK_PATH" ]]; then
            echo "Installing dev${dev_id} to $FEDI_DEVICE_ID..."
            if adb -s "$FEDI_DEVICE_ID" install -r "$APK_PATH"; then
                echo "dev${dev_id} installed successfully."
            else
                echo "dev${dev_id} install failed!"
                failed+=("$dev_id")
            fi
        else
            echo "APK not found for dev${dev_id}!"
            failed+=("$dev_id")
        fi
    else
        echo "Build failed for dev${dev_id}!"
        failed+=("$dev_id")
    fi
done

popd > /dev/null

echo ""
echo "=== Done ==="
echo "Installed $((NUM_APPS - ${#failed[@]}))/$NUM_APPS dev apps."
if [[ ${#failed[@]} -gt 0 ]]; then
    echo "Failed: ${failed[*]}"
    exit 1
fi
