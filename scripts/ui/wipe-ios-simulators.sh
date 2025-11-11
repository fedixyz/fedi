#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/scripts/enforce-nix.sh"

# Bundle identifiers for the Fedi app
BUNDLE_IDS=("org.fedi.alpha")

echo "Checking for booted iOS simulators..."

# Get list of booted simulators with their UDIDs
# Example input line: "    iPhone SE (3rd generation) (12345678-1234-1234-1234-123456789ABC) (Booted)"
# The regex breakdown:
#   ^[[:space:]]+        - Match leading whitespace at start of line
#   (.+?)                - Capture group 1: device name (non-greedy, stops before spaces+UDID)
#                          Note: Device names can contain parens like "iPhone SE (3rd generation)"
#   [[:space:]]+         - Match one or more spaces before UDID
#   \(([A-F0-9-]+)\)     - Capture group 2: UDID in parentheses (hex digits and dashes)
#   [[:space:]]+\(Booted\) - Match spaces and literal "(Booted)" text
# Replacement: \1|\2     - Output as "device_name|UDID" (pipe-separated)
booted_sims=$(xcrun simctl list devices | grep "(Booted)" | sed -E 's/^[[:space:]]+(.+?)[[:space:]]+\(([A-F0-9-]+)\)[[:space:]]+\(Booted\)/\1|\2/')

if [ -z "$booted_sims" ]; then
    echo "No booted simulators found."
    echo "Please boot a simulator first if you want to wipe its data."
    exit 0
fi

echo -e "\nBooted simulators detected:"
while IFS='|' read -r name udid; do
    # Trim any whitespace from udid
    udid=$(echo "$udid" | xargs)
    echo "  - $name ($udid)"
done <<< "$booted_sims"

echo -e "\nThis will erase app data for the following bundle IDs:"
for bundle_id in "${BUNDLE_IDS[@]}"; do
    echo "  - $bundle_id"
done

echo -e "\n⚠️  WARNING: This will permanently delete all app data on these simulators. Make sure you backed up the seed if you need it."
echo -n "Do you want to proceed? (y/N): "
read -r confirmation

if [[ ! "$confirmation" =~ ^[Yy]$ ]]; then
    echo "Cancelled. No data was wiped."
    exit 0
fi

echo -e "\nQuitting apps on simulators..."

while IFS='|' read -r name udid; do
    # Trim any whitespace from udid
    udid=$(echo "$udid" | xargs)
    echo "Processing simulator: $name (UDID: $udid)"
    for bundle_id in "${BUNDLE_IDS[@]}"; do
        # Try to quit the app if it's running
        echo "  Running: xcrun simctl terminate $udid $bundle_id"
        if xcrun simctl terminate "$udid" "$bundle_id" 2>&1; then
            echo "  ✓ Terminated $bundle_id"
        else
            echo "  • App $bundle_id not running or not installed"
        fi
    done
done <<< "$booted_sims"

echo -e "\nWiping simulator data..."

while IFS='|' read -r name udid; do
    # Trim any whitespace from udid
    udid=$(echo "$udid" | xargs)
    echo "Processing simulator: $name (UDID: $udid)"
    for bundle_id in "${BUNDLE_IDS[@]}"; do
        # Check if the app is installed
        data_path=$(xcrun simctl get_app_container "$udid" "$bundle_id" data 2>/dev/null || echo "")
        
        if [ -n "$data_path" ] && [ -d "$data_path" ]; then
            echo "  Wiping data for $bundle_id..."
            rm -rf "$data_path"
            echo "  ✓ Data wiped for $bundle_id"
        else
            echo "  • App $bundle_id not found or not installed"
        fi
    done
done <<< "$booted_sims"

echo -e "\n✓ Simulator data wipe complete!"
echo "Relaunching apps on simulators..."

while IFS='|' read -r name udid; do
    # Trim any whitespace from udid
    udid=$(echo "$udid" | xargs)
    echo "Processing simulator: $name (UDID: $udid)"
    for bundle_id in "${BUNDLE_IDS[@]}"; do
        # Try to relaunch the app if it's installed
        echo "  Running: xcrun simctl launch $udid $bundle_id"
        if xcrun simctl launch "$udid" "$bundle_id" 2>&1; then
            echo "  ✓ Relaunched $bundle_id on $name"
        else
            echo "  • Could not relaunch $bundle_id"
        fi
    done
done <<< "$booted_sims"

echo -e "\n✓ Done! Apps have been relaunched with fresh state."
