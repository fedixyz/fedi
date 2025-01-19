#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/scripts/enforce-nix.sh"

clean_node_modules() {
    echo "Cleaning node_modules folders..."
    rm -rf "$REPO_ROOT/ui/node_modules"
    rm -rf "$REPO_ROOT/ui/web/node_modules"
    rm -rf "$REPO_ROOT/ui/native/node_modules"
    rm -rf "$REPO_ROOT/ui/common/node_modules"
    rm -rf "$REPO_ROOT/ui/injections/node_modules"
}

delete_xcode_derived_data() {
    echo "Deleting DerivedData for a clean build directory..."
    if [[ -n "$CI" ]]; then
        rm -rf /Users/runner/Library/Developer/Xcode/DerivedData
    else
        rm -rf ~/Library/Developer/Xcode/DerivedData
    fi
}

clean_ios() {
    echo "Cleaning iOS build files..."
    rm -rf "$REPO_ROOT/ui/native/ios/build"
    rm -rf "$REPO_ROOT/ui/native/ios/Pods"
    delete_xcode_derived_data
}

clean_android() {
    echo "Cleaning Android build files..."
    rm -rf "$REPO_ROOT/ui/native/android/build"
    rm -rf "$REPO_ROOT/ui/native/android/app/build"
}

clean_all() {
    clean_ios
    clean_android
    clean_node_modules
}

while true; do
    echo -e "\nUI Cleaning Utils: Select an option:"
    echo "i - delete iOS build files only (ios/build, ios/Pods, and DerivedData)"
    echo "x - delete Xcode DerivedData only"
    echo "a - delete Android build files only"
    echo "n - delete all node_modules folders only"
    echo "f - full clean (all of the above)"
    echo "b - back"
    
    read -rsn1 input
    
    case $input in
        i)
            echo "Cleaning iOS build files..."
            clean_ios
            exit 0
            ;;
        x)
            echo "Deleting Xcode DerivedData..."
            delete_xcode_derived_data
            exit 0
            ;;
        a)
            echo "Cleaning Android build files..."
            clean_android
            exit 0
            ;;
        n)
            echo "Cleaning node_modules folders..."
            clean_node_modules
            exit 0
            ;;
        f)
            echo "Cleaning all /ui build files..."
            clean_all
            exit 0
            ;;
        b)
            echo "No clean action taken."
            exit 0
            ;;
        *)
            echo "Invalid option. Try again."
            ;;
    esac
done
