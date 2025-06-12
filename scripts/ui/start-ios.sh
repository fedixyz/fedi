#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

ENABLE_IOS_LOGGING=${ENABLE_IOS_LOGGING:-0}

if [[ "$BUILD_IOS" == "0" ]]; then
    echo "iOS build skipped"
    exit 0
fi

$REPO_ROOT/scripts/enforce-nix.sh

# make sure at least 1 runtime is found
runtimes=()
xcrunRuntimesList=$(xcrun simctl list runtimes)
while IFS= read -r line; do
    runtimes+=("$line")
# matches lines that start with "iOS" + version number (ex: "iOS 18.1").
done < <(echo "$xcrunRuntimesList" | grep -Eo 'iOS [0-9.]+')

# Check for required runtime and exit if not installed
if [ ${#runtimes[@]} -eq 0 ]; then
    echo "No iOS runtimes found. Please run 'just install-xcode' to install the required iOS runtimes."
    exit 1
else
    echo "Installed iOS runtimes:"
    for runtime in "${runtimes[@]}"; do
        echo "  $runtime"
    done
fi

# File to store the previously selected device ID
DEVICE_ID_FILE="/tmp/selected_device_id"

devices=()
xcrunDevicesList=$(xcrun xctrace list devices)
while IFS= read -r line; do
    devices+=("$line")
done < <(echo "$xcrunDevicesList" | grep -Eo '.*\([0-9A-Fa-f-]+\)$')

# If no devices are found, exit
if [ ${#devices[@]} -eq 0 ]; then
    echo "No iOS devices found"
    exit 1
fi

# Function to extract device ID from a device string
extract_device_id() {
    echo "$1" | sed -n -E 's/.*\(([^)]+)\).*/\1/p'
}

# Check if the device ID file exists and if the stored ID matches any current device
if [[ -f "$DEVICE_ID_FILE" ]]; then
    last_selected_device_id=$(cat "$DEVICE_ID_FILE")
    matching_device=""
    
    for device in "${devices[@]}"; do
        current_device_id=$(extract_device_id "$device")
        if [[ "$current_device_id" == "$last_selected_device_id" ]]; then
            matching_device="$device"
            break
        fi
    done
    
    if [[ -n "$matching_device" ]]; then
        echo "Last selected device: $matching_device"
        echo "Would you like to use this device again? (press ENTER/Y/y for yes, any other key for no -- will proceed after 10 seconds...):"
        
        # Read user input with timeout
        if read -t 10 user_choice; then
            user_choice=${user_choice:-Y}
        else
            user_choice="Y"
        fi

        if [[ "$user_choice" =~ ^[Yy]$ ]]; then
            selectedDevice="$matching_device"
        fi
    fi
fi

# If no device is selected yet, allow the user to choose one
if [[ -z "$selectedDevice" ]]; then
    echo "Select a device:"
    for i in "${!devices[@]}"; do 
        echo "$((i+1))) ${devices[$i]}"
    done

    # Prompt for user input and use the default choice if none is given
    read -p "Enter choice: " choice
    choice=${choice:-${#devices[@]}}

    selectedDevice=${devices[$((choice-1))]}  # adjust for 0-indexing
fi

# Extract the device ID
FEDI_DEVICE_ID=$(extract_device_id "$selectedDevice")

# Store the selected device ID for future use
echo "$FEDI_DEVICE_ID" > "$DEVICE_ID_FILE"

echo "You selected device: $selectedDevice"

# Uninstall the app from selected device for e2e tests

if [[ "$RUN_TESTS" == "1" ]]; then
    set +e
    xcrun simctl boot $FEDI_DEVICE_ID
    set -e
    xcrun simctl uninstall $FEDI_DEVICE_ID org.fedi.alpha
fi

cd $REPO_ROOT/ui/native
echo "Building & installing iOS app bundle"
run_ios_result=0

run_options="--extra-params ARCHS=arm64 --udid $FEDI_DEVICE_ID --no-packager --verbose"
run_command="arch -arm64 npx react-native run-ios $run_options"

# Launch on selected iOS device
$run_command || {
    echo -e "\n\x1B[31;1m"
    echo "Something went wrong..."
    echo "Try deleting DerivedData for a clean build directory and try again..."
    echo -e "\x1B[32;1m"
    echo "sudo rm -rf ~/Library/Developer/Xcode/DerivedData"
    echo -e "\x1B[31;1m"
    echo "   If that still doesn't work, follow the React Native docs for environment setup and try again:"
    echo "   https://reactnative.dev/docs/environment-setup"
    echo -e "\x1B[0m"
    run_ios_result=1
}

# Start logging only if the previous command was successful
if [[ "$ENABLE_IOS_LOGGING" == "1" && $run_ios_result -eq 0 ]]; then
    nix develop .#xcode --command npx react-native log-ios
fi

# Run ios tests only if the previous command was successful
if [[ "$RUN_TESTS" == "1" && "$IOS_DRIVER_PASSED" == "1" && $run_ios_result -eq 0 ]]; then
    echo "Running tests on $FEDI_DEVICE_ID"
    PLATFORM=ios DEVICE_ID=$FEDI_DEVICE_ID yarn run ts-node $REPO_ROOT/ui/native/tests/appium/runner.ts $TESTS_TO_RUN
fi
