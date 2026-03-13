#!/usr/bin/env bash

set -eou pipefail

if [ -z "${IN_NIX_SHELL:-}" ]; then
    >&2 echo "Workaround: restart in 'nix develop' shell"
    exec nix develop --command "$0" "$@"
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

step_failed() {
    echo -e "\n\x1B[31;1m========================================\x1B[0m" >&2
    echo -e "\x1B[31;1m  STEP FAILED! See error output above.\x1B[0m" >&2
    echo -e "\x1B[31;1m========================================\x1B[0m\n" >&2
}

# remind the user if the bridge was built before mprocs started
if [[ "${BUILD_BRIDGE:-}" == "1" ]]; then
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
    echo "d - open deeplink"
    echo "q - quit"

    read -rsn1 input

    case $input in
        t)
            (
                set -eou pipefail
                $REPO_ROOT/scripts/ui/test-utils.sh
            ) || step_failed
            ;;
        l)
            (
                set -eou pipefail
                echo "Running linter on all UI code"
                cd $REPO_ROOT/ui
                yarn lint
            ) || step_failed
            ;;
        u)
            (
                set -eou pipefail
                echo "Running linter & tests for all UI code"
                cd $REPO_ROOT/ui
                yarn lint
                $REPO_ROOT/scripts/ui/run-ui-tests.sh
            ) || step_failed
            ;;
        a)
            (
                set -eou pipefail
                echo "Building android bridge artifacts"
                $REPO_ROOT/scripts/bridge/build-bridge-android.sh
                echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
            ) || step_failed
            ;;
        A)
            (
                set -eou pipefail
                echo "Building android bridge artifacts & reinstalling app"
                $REPO_ROOT/scripts/bridge/build-bridge-android.sh
                echo -e "\x1B[32;1mRebuilt android bridge artifacts successfully\x1B[0m"
                $REPO_ROOT/scripts/ui/start-android.sh
            ) || step_failed
            ;;
        i)
            (
                set -eou pipefail
                echo "Building ios bridge artifacts"
                $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
                echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
            ) || step_failed
            ;;
        I)
            (
                set -eou pipefail
                echo "Building ios bridge artifacts & reinstalling app"
                $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
                echo -e "\x1B[32;1mRebuilt ios bridge artifacts successfully\x1B[0m"
                $REPO_ROOT/scripts/ui/start-ios.sh
            ) || step_failed
            ;;
        b)
            (
                set -eou pipefail
                echo "Building android bridge artifacts"
                $REPO_ROOT/scripts/bridge/build-bridge-android.sh
                echo "Building ios bridge artifacts"
                $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
                echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
            ) || step_failed
            ;;
        B)
            (
                set -eou pipefail
                echo "Building android + ios bridge artifacts & reinstalling apps"
                $REPO_ROOT/scripts/bridge/build-bridge-android.sh
                $REPO_ROOT/scripts/bridge/build-bridge-ios.sh
                echo -e "\x1B[32;1mRebuilt android + ios bridge artifacts successfully\x1B[0m"
                $REPO_ROOT/scripts/ui/start-android.sh
                $REPO_ROOT/scripts/ui/start-ios.sh
            ) || step_failed
            ;;
        w)
            (
                set -eou pipefail
                echo "Building wasm bundle"
                $REPO_ROOT/scripts/ui/install-wasm.sh
            ) || step_failed
            ;;
        r)
            (
                set -eou pipefail
                echo "Building Rust-Typescript bindings"
                $REPO_ROOT/scripts/bridge/ts-bindgen.sh
            ) || step_failed
            ;;
        c)
            (
                set -eou pipefail
                $REPO_ROOT/scripts/ui/clean-ui.sh
            ) || step_failed
            ;;
        n)
            (
                set -eou pipefail
                echo "Reinstalling node_modules"
                cd $REPO_ROOT/ui
                yarn install
            ) || step_failed
            ;;
        p)
            (
                set -eou pipefail
                echo "Reinstalling pods"
                $REPO_ROOT/scripts/ui/install-ios-deps.sh
            ) || step_failed
            ;;
        d)
            (
                set -eou pipefail
                $REPO_ROOT/scripts/ui/open-deeplink.sh
            ) || step_failed
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
