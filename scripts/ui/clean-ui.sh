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
    # the NODE_BINARY env var might have an old nix store path, so regenerate just in case
    rm -f "$REPO_ROOT/ui/native/ios/.xcode.env.local"
    delete_xcode_derived_data
}

clean_android() {
    echo "Running gradlew clean & deleting android build files..."
    pushd "$REPO_ROOT/ui/native/android"
    ./gradlew clean || true  # fails if node_modules are not installed, so just proceed
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

clean_and_rebuild() {
    clean_all
    echo "Reinstalling node_modules..."
    pushd "$REPO_ROOT/ui" && yarn install && popd
    echo "Reinstalling iOS pods..."
    "$REPO_ROOT/scripts/ui/install-ios-deps.sh"
    echo -e "\x1B[32;1mFull clean & rebuild completed successfully\x1B[0m"
}

while true; do
    echo -e "\nUI Cleaning Utils: Select an option:"
    echo "i - delete iOS build files only (ios/build, ios/Pods, and DerivedData)"
    echo "x - delete Xcode DerivedData only"
    echo "a - clean Android build files only ('gradlew clean' + removes android/build, android/app/build, and android/.gradle)"
    echo "n - delete all node_modules folders only"
    echo "f - full clean (all of the above)"
    echo "r - full clean & rebuild (clean all + reinstall node_modules + pods)"
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
        r)
            echo "Performing full clean & rebuild..."
            clean_and_rebuild
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
