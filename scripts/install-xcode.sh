#!/usr/bin/env bash

# exit on failure
set -e

# make sure to remove downloaded files if killed
cleanup() {
    echo -e "\nCleaning up..."
    rm xcodes xcodes.zip
    echo "Done"
}
exit_script() {
    cleanup
    trap - SIGINT SIGTERM # clear the trap
}
trap exit_script SIGINT SIGTERM

# download and unzip 'xcodes' utility
XCODE_VERSION_TO_INSTALL=15.0.1
XCODES_RELEASE_URL="https://github.com/XcodesOrg/xcodes/releases/download/1.4.1/xcodes.zip"
echo -e "\nDownloading xcodes... a tool to install and switch between multiple versions of Xcode"
echo -e "Download URL: $XCODES_RELEASE_URL"
echo -e "\x1B[33mIt will be removed after this command finishes...\x1B[0m\n"
curl -L -o ./xcodes.zip $XCODES_RELEASE_URL
unzip xcodes.zip
./xcodes install $XCODE_VERSION_TO_INSTALL
cleanup
echo -e "\x1B[33m\nRunning 'xcode-select -p'...\x1B[0m"
xcode-select -p
echo -e "\nBe sure that the output of xcode-select -p shown above points to \n\x1B[32;1m/Applications/Xcode-$XCODE_VERSION_TO_INSTALL.app/Contents/Developer\x1B[0m \nand NOT \n\x1B[33m/Library/Developer/CommandLineTools\x1B[0m"
echo -e "\nYou can fix this with 'sudo xcode-select --switch \x1B[32;1m/Applications/Xcode-$XCODE_VERSION_TO_INSTALL.app/Contents/Developer\x1B[0m'"
