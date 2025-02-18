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
    rm -rf ~/Library/Developer/Xcode/DerivedData
}

clean_ios() {
    echo "Deleting ios/build & ios/Pods..."
    rm -rf "$REPO_ROOT/ui/native/ios/build"
    rm -rf "$REPO_ROOT/ui/native/ios/Pods"
    delete_xcode_derived_data
}

clean_android() {
    echo "Running gradlew clean & deleting android build files..."
    pushd "$REPO_ROOT/ui/native/android"
    ./gradlew clean
    rm -rf ./.gradle
    rm -rf ./build
    rm -rf ./app/build
    popd
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
    echo "a - clean Android build files only ('gradlew clean' + removes android/build, android/app/build, and android/.gradle)"
    echo "n - delete all node_modules folders only"
    echo "f - full clean (all of the above)"
    echo "b - back"
    
    read -rsn1 input
    
    case $input in
        i)
            echo "Cleaning iOS build files only..."
            clean_ios
            exit 0
            ;;
        x)
            echo "Deleting Xcode DerivedData only..."
            delete_xcode_derived_data
            exit 0
            ;;
        a)
            echo "Cleaning Android build files only..."
            clean_android
            exit 0
            ;;
        n)
            echo "Cleaning node_modules folders only..."
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
