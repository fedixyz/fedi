#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
"$REPO_ROOT/scripts/enforce-nix.sh"

echo "=== E2E Test Runner ==="
export RUN_TESTS=1
available_tests=("onboarding" "JoinLeaveFederation")

while true; do
  echo -e "\nSelect tests to run:"
  echo "o - onboarding"
  echo "j - JoinLeaveFederation"
  echo "a - all tests"
  echo "m - manual entry (specify tests manually)"
  echo "q - quit"

  read -rsn1 input

  case $input in
    o)
      TESTS_TO_RUN="onboarding"
      echo "Selected test: onboarding"
      break
      ;;
    j)
      TESTS_TO_RUN="JoinLeaveFederation"
      echo "Selected test: JoinLeaveFederation"
      break
      ;;
    a)
      TESTS_TO_RUN="all"
      echo "Selected: all tests"
      break
      ;;
    m)
      echo "Available tests: ${available_tests[*]}"
      echo "Input the name of tests you wish to run separated by spaces, or input 'all' to run all tests and press Enter:"
      read -r test_input
      if [[ -z "$test_input" ]]; then
        echo "No tests specified. Defaulting to 'all'."
        TESTS_TO_RUN="all"
      elif [[ "$test_input" == "all" ]]; then
        TESTS_TO_RUN="all"
        echo "Running all tests"
      else
        valid_tests=()
        invalid_tests=()
        for test in $test_input; do
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
          TESTS_TO_RUN="all"
        else
          TESTS_TO_RUN="${valid_tests[*]}"
          echo "Tests to run: $TESTS_TO_RUN"
        fi
      fi
      break
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

export TESTS_TO_RUN

while true; do
  echo -e "\nSelect an option:"
  echo "a - run Android e2e tests"
  echo "i - run iOS e2e tests"
  echo "b - run both Android and iOS e2e tests"
  echo "q - quit/back"

  read -rsn1 input

  case $input in
    a)
      bash "$REPO_ROOT/scripts/ui/run-android-e2e.sh" || true
      exit 0
      ;;
    i)
      bash "$REPO_ROOT/scripts/ui/run-ios-e2e.sh" || true
      exit 0
      ;;
    b)
      bash "$REPO_ROOT/scripts/ui/run-android-e2e.sh" || true
      bash "$REPO_ROOT/scripts/ui/run-ios-e2e.sh"
      exit 0
      ;;
    q)
      exit 0
      ;;
    *)
      echo "Invalid option. Try again."
      ;;
  esac
done
