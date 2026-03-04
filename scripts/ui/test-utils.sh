#!/usr/bin/env bash

REPO_ROOT=$(git rev-parse --show-toplevel)
SELECTED_WORKSPACE=""
SELECTED_MODE=""

select_workspace() {
    while true; do
        echo -e "\nChoose workspace scope:"
        echo "a - all workspaces"
        echo "c - common only"
        echo "n - native only"
        echo "w - web only"
        echo "b - back"

        read -rsn1 workspace_input

        case $workspace_input in
            a) SELECTED_WORKSPACE="all"; return 0 ;;
            c) SELECTED_WORKSPACE="common"; return 0 ;;
            n) SELECTED_WORKSPACE="native"; return 0 ;;
            w) SELECTED_WORKSPACE="web"; return 0 ;;
            b) return 1 ;;
            *) echo "Invalid option. Try again." ;;
        esac
    done
}

select_test_mode() {
    while true; do
        echo -e "\nChoose test type:"
        echo "a - unit + integration"
        echo "u - unit only"
        echo "i - integration only"
        echo "b - back"

        read -rsn1 mode_input

        case $mode_input in
            a) SELECTED_MODE="both"; return 0 ;;
            u) SELECTED_MODE="unit"; return 0 ;;
            i) SELECTED_MODE="integration"; return 0 ;;
            b) return 1 ;;
            *) echo "Invalid option. Try again." ;;
        esac
    done
}

run_selected_tests() {
    local workspace="$1"
    local mode="$2"
    local workspace_label="$workspace"
    local workspace_arg=()

    if [[ "$workspace" == "all" ]]; then
        workspace_label="all workspaces"
    else
        workspace_arg=("$workspace")
    fi

    case "$mode" in
        both)
            echo "Running unit and integration tests for $workspace_label"
            "$REPO_ROOT/scripts/ui/run-unit-tests.sh" "${workspace_arg[@]}" || true
            "$REPO_ROOT/scripts/ui/run-integration-tests.sh" "${workspace_arg[@]}" || true
            ;;
        unit)
            echo "Running unit tests for $workspace_label"
            "$REPO_ROOT/scripts/ui/run-unit-tests.sh" "${workspace_arg[@]}" || true
            ;;
        integration)
            echo "Running integration tests for $workspace_label"
            "$REPO_ROOT/scripts/ui/run-integration-tests.sh" "${workspace_arg[@]}" || true
            ;;
    esac
}

while true; do
    echo -e "\nUI Testing Utils: Select an option:"
    echo "a - run unit & integration tests for all UI workspaces"
    echo "t - choose workspace + test type"
    echo "e - run e2e tests"
    echo "b - back"

    read -rsn1 input

    case $input in
        a)
            run_selected_tests "all" "both"
            ;;
        e)
            bash "$REPO_ROOT/scripts/ui/run-e2e.sh" || true
            ;;
        t)
            if select_workspace; then
                if select_test_mode; then
                    run_selected_tests "$SELECTED_WORKSPACE" "$SELECTED_MODE"
                fi
            fi
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
