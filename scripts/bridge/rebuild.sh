#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

# remind the user if the bridge was built before mprocs started
if [[ "$BUILD_BRIDGE" == "1" ]]; then
    echo "Latest bridge has been built..."
else
    echo "Bridge build was skipped..."
fi

while true; do
    echo "Select an option:"
    echo "a - rebuild bridge (android only)"
    echo "A - rebuild bridge & reinstall app (android only)"
    echo "i - rebuild bridge (ios only)"
    echo "I - rebuild bridge & reinstall app (ios only)"
    echo "b - rebuild bridge (both android + ios)"
    echo "B - rebuild bridge & reinstall apps (both android + ios)"
    echo "w - rebuild wasm"
    echo "t - rebuild Typescript bindings"
    echo "q - quit"
    
    read -rsn1 input
    
    case $input in
        a)
            echo "Building android bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh
            echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
            ;;
        A)
            echo "Building android bridge artifacts & reinstalling app"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh
            echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-android.sh
            ;;
        i)
            echo "Building ios bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
            echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
            ;;
        I)
            echo "Building ios bridge artifacts & reinstalling app"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
            echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-ios.sh
            ;;
        b)
            echo "Building android bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh
            echo "Building ios bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
            echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
            ;;
        B)
            echo "Building android + ios bridge artifacts & reinstalling apps"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
            echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-android.sh
            $REPO_ROOT/scripts/ui/start-ios.sh
            ;;
        w)
            echo "Building wasm bundle"
            $REPO_ROOT/scripts/install-wasm.sh
            ;;
        t)
            echo "Building Rust-Typescript bindings"
            $REPO_ROOT/scripts/bridge/ts-bindgen.sh
            ;;
        q)
            echo "Exiting."
            exit 0
            ;;
        *)
            echo "Invalid option. Try again."
            ;;
    esac
done
