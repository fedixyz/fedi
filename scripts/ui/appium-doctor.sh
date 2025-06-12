#!/usr/bin/env bash

set -e

$REPO_ROOT/scripts/enforce-nix.sh

ANDROID_DRIVER_PASSED=1
IOS_DRIVER_PASSED=1

echo "=== Checking Appium prerequisites ==="

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

# Check if Appium is installed and is version 2.x
if ! command -v appium &> /dev/null; then
    echo "❌ Appium is not installed. Please install Appium 2.x"
    export RUN_TESTS=0
    exit 1
else
    appium_version=$(appium --version 2>&1)
    echo "Appium version: $appium_version"
    if ! check_version "$appium_version" "2"; then
        echo "❌ Appium version 2.x is required, but found version $appium_version"
        export RUN_TESTS=0
        exit 1
    else
        echo "✓ Appium 2.x is installed"
    fi
fi

if [[ "$BUILD_ANDROID" == "1" ]]; then
    echo "=== Checking Android prerequisites ==="
    # Check if UiAutomator2 driver is installed and is version 4.x
    uia2_output=$(appium driver list --installed 2>&1 | grep -i uiautomator2)
    if [[ -z "$uia2_output" ]]; then
        echo "❌ UiAutomator2 driver is not installed"
        ANDROID_DRIVER_PASSED=0
    else
        uia2_version=$(echo "$uia2_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        echo "UiAutomator2 driver version: $uia2_version"
        if ! check_version "$uia2_version" "4"; then
            echo "❌ UiAutomator2 driver version 4.x is required, but found version $uia2_version"
            ANDROID_DRIVER_PASSED=0
        else
            echo "✓ UiAutomator2 driver 4.x is installed"
            echo "=== Running UiAutomator2 driver doctor ==="
            set +e
            appium driver doctor uiautomator2
            doctor_exit_code=$?
            set -e
            if [[ $doctor_exit_code -ne 0 ]]; then
                echo "❌ UiAutomator2 driver doctor failed with exit code $doctor_exit_code"
                ANDROID_DRIVER_PASSED=0
            else
                echo "✓ UiAutomator2 driver doctor reported no critical issues"
            fi
        fi
    fi
else
    echo "=== Skipping Android checks ==="
    # Since we're not building Android, mark it as "passed" for logic purposes
    ANDROID_DRIVER_PASSED=1
fi

if [[ "$BUILD_IOS" == "1" ]]; then
    echo "=== Checking iOS prerequisites ==="
    # Check if XCUITest driver is installed and is version 9.x
    xcui_output=$(appium driver list --installed 2>&1 | grep -i xcuitest)
    if [[ -z "$xcui_output" ]]; then
        echo "❌ XCUITest driver is not installed"
        IOS_DRIVER_PASSED=0
    else
        xcui_version=$(echo "$xcui_output" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
        echo "XCUITest driver version: $xcui_version"
        if ! check_version "$xcui_version" "9"; then
            echo "❌ XCUITest driver version 9.x is required, but found version $xcui_version"
            IOS_DRIVER_PASSED=0
        else
            echo "✓ XCUITest driver 9.x is installed"
            echo "=== Running XCUITest driver doctor ==="
            set +e
            nix develop .#xcode --command appium driver doctor xcuitest
            doctor_exit_code=$?
            set -e
            if [[ $doctor_exit_code -ne 0 ]]; then
                echo "❌ XCUITest driver doctor failed with exit code $doctor_exit_code"
                IOS_DRIVER_PASSED=0
            else
                echo "✓ XCUITest driver doctor reported no critical issues"
            fi
        fi
    fi
else
    echo "=== Skipping iOS checks ==="
    # Since we're not building iOS, mark it as "passed" for logic purposes
    IOS_DRIVER_PASSED=1
fi

echo "Android driver test passed: $ANDROID_DRIVER_PASSED"
echo "iOS driver test passed: $IOS_DRIVER_PASSED"

if [[ "$BUILD_ANDROID" == "1" && "$BUILD_IOS" == "0" && "$ANDROID_DRIVER_PASSED" == "0" ]]; then
    echo "❌ Only Android is being built, but UiAutomator2 test failed"
    echo "Not starting Appium server"
    export RUN_TESTS=0
    exit 1

elif [[ "$BUILD_ANDROID" == "0" && "$BUILD_IOS" == "1" && "$IOS_DRIVER_PASSED" == "0" ]]; then
    echo "❌ Only iOS is being built, but XCUITest test failed"
    echo "Will not start Appium server"
    export RUN_TESTS=0
    exit 1

elif [[ "$BUILD_ANDROID" == "1" && "$BUILD_IOS" == "1" && "$ANDROID_DRIVER_PASSED" == "0" && "$IOS_DRIVER_PASSED" == "0" ]]; then
    echo "❌ Both platforms are being built and both driver tests failed"
    echo "Will not start Appium server"
    export RUN_TESTS=0
    exit 1

elif [[ "$BUILD_ANDROID" == "1" && "$BUILD_IOS" == "1" && ("$ANDROID_DRIVER_PASSED" == "0" || "$IOS_DRIVER_PASSED" == "0") ]]; then
    echo "⚠️ Both platforms are being built, but only one driver test failed"
    echo "Starting Appium server anyway"
    # Keep RUN_TESTS as is

# All tests passed or other scenarios
else
    echo "✓ All required driver tests passed"
fi

export IOS_DRIVER_PASSED
export ANDROID_DRIVER_PASSED
