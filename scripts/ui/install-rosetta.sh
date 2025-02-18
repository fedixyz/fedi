#!/usr/bin/env bash

set -e

OS_NAME=$(uname -s)  # Gets the operating system name (e.g., Darwin for macOS, Linux for Linux)
ARCH=$(uname -m)  # Gets the architecture (e.g., arm64, x86_64)

if [[ "$OS_NAME" == "Darwin" && "$ARCH" == "arm64" ]]; then
    echo "Running Rosetta installation check on macOS ARM64..."
    # Check if Rosetta is installed
    ROSETTA_DIR="/Library/Apple/usr/libexec/oah"
    if [[ -d "$ROSETTA_DIR" ]]; then
        # Test execution of x86 binary
        if arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
            echo -e "\x1B[32;1mRosetta is installed and functioning correctly.\x1B[0m"
        else
            echo -e "\x1B[31;1mRosetta is partially installed or not functioning correctly.\x1B[0m"
            echo "Reinstalling Rosetta..."
            sudo /usr/sbin/softwareupdate --install-rosetta --agree-to-license
            if [[ $? -eq 0 ]]; then
                echo -e "\x1B[32;1mRosetta has been reinstalled successfully.\x1B[0m"
            else
                echo -e "\x1B[31;1mFailed to reinstall Rosetta. Please check your system settings.\x1B[0m"
            fi
        fi
    else
        echo -e "\nRosetta is not installed. Installing Rosetta..."
        sudo /usr/sbin/softwareupdate --install-rosetta --agree-to-license
        if [[ $? -eq 0 ]]; then
            echo -e "\x1B[32;1mRosetta has been installed successfully.\x1B[0m"
        else
            echo -e "\x1B[31;1mFailed to install Rosetta. Please check your system settings.\x1B[0m"
        fi
    fi
elif [[ "$OS_NAME" == "Linux" && "$ARCH" == "arm64" ]]; then
    echo "This is a Linux ARM64 system. Rosetta installation is not applicable."
else
    echo "This system is not ARM-based or not macOS; Rosetta is not required."
fi