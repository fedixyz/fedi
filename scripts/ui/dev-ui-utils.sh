#!/usr/bin/env bash

REPO_ROOT=$(git rev-parse --show-toplevel)

# remind the user if the bridge was built before mprocs started
if [[ "$BUILD_BRIDGE" == "1" ]]; then
    echo "Latest bridge has been built..."
else
    echo "Bridge build was skipped..."
fi

while true; do
    echo -e "\nDev Utils: Select an option:"
    echo "t - test UI code"
    echo "l - run the linter for /ui workspace"
    echo "u - run linter + tests for /ui workspace"
    echo "a - rebuild bridge (android only)"
    echo "A - rebuild bridge & reinstall app (android only)"
    echo "i - rebuild bridge (ios only)"
    echo "I - rebuild bridge & reinstall app (ios only)"
    echo "b - rebuild bridge (both android + ios)"
    echo "B - rebuild bridge & reinstall apps (both android + ios)"
    echo "w - rebuild wasm"
    echo "r - rebuild Rust-Typescript bindings"
    echo "c - clean UI files"
    echo "n - reinstall node_modules"
    echo "p - reinstall pods"
    echo "q - quit"
    
    read -rsn1 input
    
    case $input in
        t)
            $REPO_ROOT/scripts/ui/test-utils.sh || true
            ;;
        l)
            echo "Running linter on all UI code"
            pushd $REPO_ROOT/ui && yarn lint && popd || true
            ;;
        u)
            echo "Running linter & tests for all UI code"
            pushd $REPO_ROOT/ui && yarn lint && popd && $REPO_ROOT/scripts/ui/run-ui-tests.sh || true
            ;;
        a)
            echo "Building android bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh || true
            echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
            ;;
        A)
            echo "Building android bridge artifacts & reinstalling app"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh || true
            echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-android.sh || true
            ;;
        i)
            echo "Building ios bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh || true
            echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
            ;;
        I)
            echo "Building ios bridge artifacts & reinstalling app"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh || true
            echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-ios.sh || true
            ;;
        b)
            echo "Building android bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh || true
            echo "Building ios bridge artifacts"
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh || true
            echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
            ;;
        B)
            echo "Building android + ios bridge artifacts & reinstalling apps"
            $REPO_ROOT/scripts/bridge/build-bridge-android.sh || true
            $REPO_ROOT/scripts/bridge/build-bridge-ios.sh || true
            echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
            $REPO_ROOT/scripts/ui/start-android.sh || true
            $REPO_ROOT/scripts/ui/start-ios.sh || true
            ;;
        w)
            echo "Building wasm bundle"
            $REPO_ROOT/scripts/ui/install-wasm.sh || true
            ;;
        r)
            echo "Building Rust-Typescript bindings"
            $REPO_ROOT/scripts/bridge/ts-bindgen.sh || true
            ;;
        c)
            $REPO_ROOT/scripts/ui/clean-ui.sh || true
            ;;
        n)
            echo "Reinstalling node_modules"
            pushd $REPO_ROOT/ui && yarn install && popd || true
            ;;
        p)
            echo "Reinstalling pods"
            $REPO_ROOT/scripts/ui/install-ios-deps.sh || true
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
