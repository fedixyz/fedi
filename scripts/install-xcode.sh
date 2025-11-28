#!/usr/bin/env bash

# exit on failure
set -e

# make sure to remove downloaded files if killed
cleanup() {
    echo -e "\nCleaning up..."
    rm xcodes xcodes.zip
    echo "Cleanup done"
}
exit_script() {
    cleanup
    trap - SIGINT SIGTERM # clear the trap
}
prompt_move_xcode() {
    echo -e "\nThe installed version of Xcode must be located at $EXPECTED_XCODE_PATH. Press y/Y to rename the directory:"
    read -r user_response

    if [[ "$user_response" == "y" || "$user_response" == "Y" ]]; then
        if [ -d "$EXPECTED_XCODE_PATH" ]; then
            echo -e "\nMoving existing Xcode to /Applications/Xcode-backup.app"
            sudo xcode-select --switch "$EXPECTED_XCODE_PATH"
            INSTALLED_VERSION=$(xcodebuild -version | head -n 1 | awk '{print $2}')
            mv "$EXPECTED_XCODE_PATH" /Applications/Xcode-$INSTALLED_VERSION.app
        fi
        if [ -d "$INSTALLED_XCODE_PATH" ]; then
            echo -e "\nMoving newly installed Xcode $INSTALLED_XCODE_PATH to $EXPECTED_XCODE_PATH"
            mv "$INSTALLED_XCODE_PATH" "$EXPECTED_XCODE_PATH"
        fi
    else
        echo -e "\nOperation cancelled by the user."
        exit 1
    fi
}
trap exit_script SIGINT SIGTERM

# download and unzip 'xcodes' utility
XCODE_VERSION_TO_INSTALL=26.0.0
IOS_RUNTIME_TO_INSTALL="iOS 26.0"
XCODES_RELEASE_URL="https://github.com/XcodesOrg/xcodes/releases/download/1.6.2/xcodes.zip"
INSTALLED_XCODE_PATH="/Applications/Xcode-$XCODE_VERSION_TO_INSTALL.app"
EXPECTED_XCODE_PATH="/Applications/Xcode.app"
 
echo -e "\nDownloading xcodes... a tool to install and switch between multiple versions of Xcode"
echo -e "Download URL: $XCODES_RELEASE_URL"
echo -e "\x1B[33mIt will be removed after this command finishes...\x1B[0m\n"
curl -L -o ./xcodes.zip $XCODES_RELEASE_URL
unzip xcodes.zip
./xcodes install "$XCODE_VERSION_TO_INSTALL"

echo -e "\nMaking sure xcode-select is set to the expected path: $EXPECTED_XCODE_PATH/Contents/Developer"
sudo xcode-select --switch "$EXPECTED_XCODE_PATH/Contents/Developer"

# This logic makes sure the correct version is located at /Applications/Xcode.app
echo -e "\x1B[33m\nChecking for existing Xcode installation at $EXPECTED_XCODE_PATH\x1B[0m"
if [ -d "$EXPECTED_XCODE_PATH" ]; then
    echo -e "\nFound existing Xcode, checking version... (requires sudo)"
    # Check if xcodebuild version matches expected version
    INSTALLED_VERSION=$(xcodebuild -version | head -n 1 | awk '{print $2}')
    if [[ "$XCODE_VERSION_TO_INSTALL" == *"$INSTALLED_VERSION"* ]]; then
        echo -e "\n\x1B[32;1mXcode version $INSTALLED_VERSION+ is already installed at the expected location.\x1B[0m"
    else
        echo -e "\nError: Xcode version found at $EXPECTED_XCODE_PATH ($INSTALLED_VERSION) does not match expected version ($XCODE_VERSION_TO_INSTALL)"
        prompt_move_xcode
    fi
else
    echo -e "\nNo existing Xcode installation found at $EXPECTED_XCODE_PATH"
    prompt_move_xcode
fi

./xcodes runtimes install "$IOS_RUNTIME_TO_INSTALL" || {
    echo -e "\x1B[33mWarning: Failed to install iOS runtime $IOS_RUNTIME_TO_INSTALL. Continuing anyway...\x1B[0m"
}

cleanup
echo -e "\x1B[33m\nRunning 'xcode-select -p'...\x1B[0m"
xcode-select -p
echo -e "\nBe sure that the output of xcode-select -p shown above points to \n\x1B[32;1m/Applications/Xcode.app/Contents/Developer\x1B[0m \nand NOT \n\x1B[33m/Library/Developer/CommandLineTools\x1B[0m"
echo -e "\nYou can fix this with 'sudo xcode-select --switch \x1B[32;1m$EXPECTED_XCODE_PATH/Contents/Developer\x1B[0m'"
