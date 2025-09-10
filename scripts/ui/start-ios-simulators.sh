#!/usr/bin/env bash

set -e

if ! command -v xcrun &> /dev/null; then
    echo "ERROR: xcrun not found. Make sure Xcode is installed and in PATH."
    exit 1
fi

# Cleanup if interrupted to kill hanging simulator processes
cleanup() {
    echo "Script interrupted, cleaning up hanging simulator processes..."
    pkill -f "Simulator" 2>/dev/null || true
}
trap cleanup INT TERM

# Define simulator configurations using IDs from xcrun
declare -A DEVICE_TYPES
declare -A RUNTIMES
DEVICE_TYPES["ios-15"]="com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation"
DEVICE_TYPES["ios-18"]="com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro"
RUNTIMES["ios-15"]="com.apple.CoreSimulator.SimRuntime.iOS-15-5"
RUNTIMES["ios-18"]="com.apple.CoreSimulator.SimRuntime.iOS-18-1"

# Extracts UDID or state from simulator list output `xcrun simctl list devices`
# Usage: extract_sim_info "search_term" "udid|state"
# sample output:
#   iPhone SE (3rd generation) (58D0D47E-36DC-4E40-AF61-892FDDC36FA4) (Shutdown) 
#   ios-18 (863FC926-F6BA-48D0-A8F1-3846A739CA4B) (Shutdown)
extract_sim_info() {
    local search_term="$1"
    local info_type="$2"
    
    local line
    line=$(xcrun simctl list devices | grep "$search_term" | head -1)
    
    case "$info_type" in
        "udid")
            echo "$line" | sed -E 's/.*\(([A-F0-9-]+)\) \(.*/\1/' || echo ""
            ;;
        "state")
            echo "$line" | sed -E 's/.*\([A-F0-9-]+\) \(([^)]+)\).*/\1/' || echo ""
            ;;
        *)
            echo "ERROR: Invalid info_type. Use 'udid' or 'state'"
            return 1
            ;;
    esac
}

# In CI we start all configured simulators; locally we only start ios-18
if [[ -n "${CI:-}" ]]; then
    echo "Starting all configured iOS simulators for CI"
    SIM_NAMES=("ios-15" "ios-18")
else
    echo "Starting only ios-18 simulator for development"
    SIM_NAMES=("ios-18")
fi

create_simulator() {
    local sim_name="$1"
    local device_type_id="${DEVICE_TYPES[$sim_name]}"
    local runtime_id="${RUNTIMES[$sim_name]}"
    
    echo "Checking for existing simulator: $sim_name with device $device_type_id and runtime $runtime_id..." >&2
    
    local simulator_udid
    simulator_udid=$(extract_sim_info "$sim_name" "udid")
    
    if [[ -n "$simulator_udid" ]]; then
        echo "Found existing simulator '$sim_name' with UDID: $simulator_udid" >&2
    else
        echo "No existing simulator found. Creating new one..." >&2
        echo "Running: xcrun simctl create '$sim_name' '$device_type_id' '$runtime_id'" >&2
        simulator_udid=$(xcrun simctl create "$sim_name" "$device_type_id" "$runtime_id")
        if [[ -z "$simulator_udid" ]]; then
            echo "ERROR: Failed to create simulator '$sim_name'" >&2
            exit 1
        fi
        echo "Created new simulator '$sim_name' with UDID: $simulator_udid" >&2
    fi
    
    echo "Simulator $simulator_udid is ready" >&2
    # no >&2 to return udid to caller
    echo "$simulator_udid"
}

start_and_wait_for_simulator() {
    local sim_name="$1"
    local simulator_udid="$2"
    
    echo "Starting simulator '$sim_name' ($simulator_udid)..."
    echo "Running: xcrun simctl boot '$simulator_udid'"
    
    if ! xcrun simctl boot "$simulator_udid" 2>&1; then
        echo "Boot command failed or simulator might already be booted, continuing..."
    fi
    
    echo "Waiting for $sim_name to boot (timeout: 5 minutes)..."
    local boot_complete=false
    for attempt in {1..30}; do
        sim_state=$(extract_sim_info "$simulator_udid" "state")
        if [[ "$sim_state" == "Booted" ]]; then
            echo "$sim_name is ready after $((attempt * 10)) seconds"
            boot_complete=true
            break
        fi
        echo "Boot attempt $attempt: Simulator $sim_name not ready yet (state: $sim_state), waiting 10 more seconds..."
        sleep 10
    done
    
    if [[ "$boot_complete" != "true" ]]; then
        echo "WARNING: Timed out after 5 minutes waiting for $sim_name to boot"
        return 1
    fi
    
    # Configure for testing - disable hardware keyboard to ensure software keyboard is used
    echo "Configuring software keyboard for testing..."
    sleep 2 
    xcrun simctl spawn "$simulator_udid" defaults write com.apple.iphonesimulator ConnectHardwareKeyboard 0 2>/dev/null || true
}

declare -A SIMULATOR_UDIDS

echo "iOS DEVELOPER_DIR: $DEVELOPER_DIR"
echo "Preparing simulators..."
for sim_name in "${SIM_NAMES[@]}"; do
    simulator_udid=$(create_simulator "$sim_name")
    SIMULATOR_UDIDS["$sim_name"]="$simulator_udid"
    start_and_wait_for_simulator "$sim_name" "$simulator_udid"
done

# testing scripts need these env vars to find the simulators
echo "Exporting simulator UUIDs for test scripts..."
for sim_name in "${SIM_NAMES[@]}"; do
    udid="${SIMULATOR_UDIDS[$sim_name]}"
    # Convert ios-15 -> IOS_15_UDID, ios-18 -> IOS_18_UDID
    env_var_name=$(echo "$sim_name" | tr '[:lower:]' '[:upper:]' | tr '-' '_')_UDID
    
    export "$env_var_name"="$udid"
    echo "$env_var_name=$udid"
    [[ -n "${GITHUB_ENV:-}" ]] && echo "$env_var_name=$udid" >> "$GITHUB_ENV"
done

echo "=== iOS Simulators Status ==="
xcrun simctl list devices | grep -E "(Booted)"

echo "iOS simulators are ready for testing!"
