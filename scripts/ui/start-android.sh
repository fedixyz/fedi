#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

ENABLE_ANDROID_LOGGING=${ENABLE_ANDROID_LOGGING:-0}

if [[ "$BUILD_ANDROID" == "0" ]]; then
    echo "Android build skipped"
    exit 0
fi

$REPO_ROOT/scripts/enforce-nix.sh

DEVICE_ID_FILE="/tmp/selected_android_device_id"

echo "Detecting connected Android devices..."
mapfile -t all_device_ids < <(adb devices | grep -v "List" | grep -v "^$" | awk '{print $1}')
echo "Raw device IDs detected: ${all_device_ids[*]}"
echo "Number of devices found: ${#all_device_ids[@]}"

if [[ ${#all_device_ids[@]} -eq 0 ]]; then
    echo "No Android devices found. Please connect a device with debugging enabled, or launch an emulator and restart the script."
    exit 1
fi

devices=()
device_ids=()

for device_id in "${all_device_ids[@]}"; do
    echo "Getting details for device: $device_id"
    if [[ -z "$device_id" ]]; then
        echo "Skipping empty device ID"
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

echo "Processed ${#devices[@]} devices:"
for ((i=0; i<${#devices[@]}; i++)); do
    echo "Device $((i+1)): ${devices[$i]} with ID: ${device_ids[$i]}"
done

selectedDevice=""
FEDI_DEVICE_ID=""

if [[ -f "$DEVICE_ID_FILE" ]]; then
    last_selected_device_id=$(cat "$DEVICE_ID_FILE")
    matching_device=""
    matching_index=-1
    for i in "${!device_ids[@]}"; do
        if [[ "${device_ids[$i]}" == "$last_selected_device_id" ]]; then
            matching_device="${devices[$i]}"
            matching_index=$i
            break
        fi
    done
    if [[ -n "$matching_device" ]]; then
        echo "Last selected device: $matching_device"
        echo "Would you like to use this device again? (press ENTER/Y/y for yes, any other key for no -- will proceed after 10 seconds...):"
        if read -t 10 user_choice; then
            user_choice=${user_choice:-Y}
        else
            user_choice="Y"
        fi

        if [[ "$user_choice" =~ ^[Yy]$ ]]; then
            selectedDevice="$matching_device"
            FEDI_DEVICE_ID="${device_ids[$matching_index]}"
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

echo "You selected device: $selectedDevice with ID: $FEDI_DEVICE_ID"

pushd "$REPO_ROOT/ui/native/android"
echo "Building & installing android app bundle"

# react-native tries to start metro in a new terminal window if none is detected
# so wait a few seconds for the metro terminal to start first
sleep 2

already_cleaned_android=false

attempt_run_android() {

    # Explicitly build APK first
    ./gradlew assembleProductionDebug -Pandroid.injected.testOnly=false || {
        echo "Something went wrong during APK assembly..."
        return 1
    }

    # Find the generated APK explicitly
    APK_PATH=$(find ~+ ./app/build/outputs/apk/production/debug -name "*.apk" | head -1)
    if [[ ! -f "$APK_PATH" ]]; then
        echo "APK not found after build!"
        return 1
    fi
    echo "APK built successfully at $APK_PATH"

    # Install APK
    echo "Installing APK explicitly to the selected device ($FEDI_DEVICE_ID)..."
    adb -s "$FEDI_DEVICE_ID" install -r "$APK_PATH" || {
        echo "APK installation failed."
        return 1
    }
    echo "APK installed successfully."

    # Correct extraction of applicationId from build.gradle
    echo "Extracting application ID from build.gradle..."
    APP_ID=$(grep applicationId $REPO_ROOT/ui/native/android/app/build.gradle | head -1 | awk -F '\"' '{print $2}')
    if [[ -z "$APP_ID" ]]; then
        echo "Could not extract applicationId from build.gradle."
        return 1
    fi
    echo "Application ID extracted successfully: $APP_ID"

    if [[ "$RUN_TESTS" == "1" && "$ANDROID_DRIVER_PASSED" == "1" && -f "$APK_PATH" ]]; then
        echo "Clearing app data for testing..."
        adb -s $FEDI_DEVICE_ID shell pm clear $APP_ID || {
            echo "Warning: Could not clear app data. Tests may fail."
        }
        adb -s "$FEDI_DEVICE_ID" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 || {
            echo "APK launch failed."
            return 1
        }
        echo "APK launched successfully."
        echo "Running tests on $FEDI_DEVICE_ID"
        PLATFORM=android DEVICE_ID=$FEDI_DEVICE_ID BUNDLE_PATH=$APK_PATH yarn run ts-node $REPO_ROOT/ui/native/tests/appium/runner.ts $TESTS_TO_RUN
    fi

    # Explicitly launch app after successful installation
    echo "Launching APK..."
    adb -s "$FEDI_DEVICE_ID" shell monkey -p "$APP_ID" -c android.intent.category.LAUNCHER 1 || {
        echo "APK launch failed."
        return 1
    }

    echo "APK launched successfully."
    return 0
}

attempt_clean_android() {
    echo "Cleaning android build files..."
    echo "Running gradlew clean & deleting android build files..."
    ./gradlew clean
    rm -rf ./.gradle
    rm -rf ./build
    rm -rf ./app/build
}

# Try to build, install, and launch the app. If it fails, clean and retry once. Exit if it fails again.
pushd "$REPO_ROOT/ui/native/android"
attempt_run_android || {
    if [[ "$already_cleaned_android" == false ]]; then
        already_cleaned_android=true
        echo "Android command failed. Attempting to clean android build files and retrying..."
        attempt_clean_android
        attempt_run_android || {
            echo "Android command failed again after cleaning. Exiting with error."
            popd
            exit 1
        }
    else
        echo "Android command failed. Exiting with error."
        popd
        exit 1
    fi
}
popd >/dev/null
# Start logging only if the previous command was successful
if [[ "$ENABLE_ANDROID_LOGGING" == "1" ]]; then
    echo "Starting android logging..."
    pushd "$REPO_ROOT/ui/native"
    npx react-native log-android
    popd
fi
