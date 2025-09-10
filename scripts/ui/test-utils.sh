#!/usr/bin/env bash

REPO_ROOT=$(git rev-parse --show-toplevel)

while true; do
    echo -e "\nUI Testing Utils: Select an option:"
    echo "a - run tests for all UI workspaces"
    echo "c - run tests for common workspace only"
    echo "n - run tests for native workspace only"
    echo "w - run tests for web workspace only"
    echo "e - run e2e tests"
    echo "b - back"

    read -rsn1 input

    case $input in
        a)
            echo "Running tests for all UI workspaces"
            $REPO_ROOT/scripts/ui/run-ui-tests.sh || true
            ;;
        c)
            echo "Running tests for common workspace only"
            pushd "$REPO_ROOT/ui" && yarn test:common && popd || true
            ;;
        n)
            echo "Running tests for native workspace only"
            pushd "$REPO_ROOT/ui" && yarn test:native && popd || true
            ;;
        w)
            echo "Running tests for web workspace only"
            pushd "$REPO_ROOT/ui" && yarn test:web && popd || true
            ;;
        e)
            bash "$REPO_ROOT/scripts/ui/run-e2e.sh" || true
            ;;
        b)
            echo "No testing action taken."
            exit 0
            ;;
        *)
            echo "Invalid option. Try again."
            ;;
    esac
done
