#!/usr/bin/env bash

# exit on failure (strict)
set -euo pipefail

REPO_ROOT=$(git rev-parse --show-toplevel)

# Rosetta installation check (only on macOS ARM64)
OS_NAME=$(uname -s)
ARCH=$(uname -m)

if [[ "$OS_NAME" == "Darwin" && "$ARCH" == "arm64" ]]; then
    # Check if Rosetta is installed by trying to run an x86 binary
    if ! arch -x86_64 /usr/bin/true >/dev/null 2>&1; then
        echo -e "\n\x1B[31;1mRosetta is not installed or functioning correctly.\x1B[0m"
        echo "Please run the following command to install Rosetta:"
        echo -e "\x1B[32;1mjust install-rosetta\x1B[0m"
        exit 1  # Exit with failure to prevent further execution
    fi
fi

echo "Rosetta check passed. Continuing..."

$REPO_ROOT/scripts/enforce-nix.sh

BUILD_BRIDGE=${BUILD_BRIDGE:-1}
BUILD_PWA=${BUILD_PWA:-1}
BUILD_ANDROID=${BUILD_ANDROID:-1}
BUILD_IOS=${BUILD_IOS:-1}
REINSTALL_UI_DEPS=${REINSTALL_UI_DEPS:-1}
REINSTALL_PODS=${REINSTALL_PODS:-1}
RUN_TESTS=${RUN_TESTS:-0}
SELECT_IOS_DEVICE=${SELECT_IOS_DEVICE:-0}

# don't build target for iOS device by default to save on build time / disk space
BUILD_ALL_BRIDGE_TARGETS=${BUILD_ALL_BRIDGE_TARGETS:-0}
if [[ "$MODE" == "device" ]]; then
  BUILD_ALL_BRIDGE_TARGETS=1
fi

if [[ "$MODE" == "interactive" ]]; then
  echo "Running development UI (native + PWA) in interactive mode"
  # Set to true so we can handle it in the start-ios.sh script
  SELECT_IOS_DEVICE=1

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Use remote bridge? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Nn]$ ]]; then
    export FEDI_DISABLE_REMOTE_BRIDGE=1
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Rebuild the bridge? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BUILD_BRIDGE=1

    unset REPLY
    while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
    do
      read -p "Build all bridge targets? (y/n) " -n 1 -r
      echo
    done
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      BUILD_ALL_BRIDGE_TARGETS=1
    else
      BUILD_ALL_BRIDGE_TARGETS=0
    fi
  else
    BUILD_BRIDGE=0
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Reinstall UI dependencies? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    REINSTALL_UI_DEPS=1
  else
    REINSTALL_UI_DEPS=0
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Build PWA? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BUILD_PWA=1
  else
    BUILD_PWA=0
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Build for Android? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BUILD_ANDROID=1
  else
    BUILD_ANDROID=0
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Build for iOS? (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    BUILD_IOS=1
    REINSTALL_PODS=1
    SELECT_IOS_DEVICE=1
    unset REPLY
    while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
    do
      read -p "Reinstall pods? (y/n) " -n 1 -r
      echo
    done
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      REINSTALL_PODS=1
    else
      REINSTALL_PODS=0
    fi
  else
    BUILD_IOS=0
    REINSTALL_PODS=0
    # disable this since we are skipping ios build
    SELECT_IOS_DEVICE=0
  fi

  unset REPLY
  while [[ -z "${REPLY:-}" ]] || ! [[ "${REPLY:-}" =~ ^[YyNn]$ ]]
  do
    read -p "Run e2e tests (WARNING: app data will be erased) (y/n) " -n 1 -r
    echo
  done
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    export RUN_TESTS=1
    available_tests=("onboarding" "JoinLeaveFederation")
    echo "Available tests: ${available_tests[*]}"
    echo "Input the name of tests you wish to run separated by spaces, or input 'all' to run all tests and press Enter:"
    read -r test_input
    if [[ -z "$test_input" ]]; then
      echo "No tests specified. Defaulting to 'all'."
      export TESTS_TO_RUN="all"
    elif [[ "$test_input" == "all" ]]; then
      export TESTS_TO_RUN="all"
      echo "Running all tests"
    else
      valid_tests=()
      invalid_tests=()
      for test in $test_input; do
        # was if [[ " ${available_tests[*]} " =~ " $test " ]]; then but got a lint warning
        if [[ ${available_tests[*]} =~ $test ]]; then
          valid_tests+=("$test")
        else
          invalid_tests+=("$test")
        fi
      done
      if [[ ${#invalid_tests[@]} -gt 0 ]]; then
        echo "Warning: Ignoring invalid test names: ${invalid_tests[*]}"
      fi
      if [[ ${#valid_tests[@]} -eq 0 ]]; then
        echo "No valid tests specified. Defaulting to 'all'."
        export TESTS_TO_RUN="all"
      else
        export TESTS_TO_RUN="${valid_tests[*]}"
        echo "Tests to run: $TESTS_TO_RUN"
      fi
    fi
  fi
else
  echo "Running development UI (native + PWA)"
fi

if [[ "$RUN_TESTS" == "1" ]]; then
  source $REPO_ROOT/scripts/ui/appium-doctor.sh
  export ANDROID_DRIVER_PASSED
  export IOS_DRIVER_PASSED
fi

# export these so other scripts can see them
export BUILD_BRIDGE
export BUILD_PWA
export BUILD_ANDROID
export BUILD_IOS
export REINSTALL_UI_DEPS
export REINSTALL_PODS
export BUILD_ALL_BRIDGE_TARGETS
export RUN_TESTS
export TESTS_TO_RUN
export SELECT_IOS_DEVICE


source $REPO_ROOT/scripts/ui/dev-setup.sh

cd $REPO_ROOT
mprocs -c $REPO_ROOT/misc/mprocs-dev-ui.yaml
