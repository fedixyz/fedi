#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

if [[ -n "$CI" ]]; then
    # run metro in background with logfile & PID
    echo "ui: starting react-native metro bundler in CI"
    export ENABLE_LOGBOX=0
    
    pushd $REPO_ROOT/ui/native
    yarn start > $REPO_ROOT/metro.log 2>&1 &
    echo $! > $REPO_ROOT/metro_pid.txt
    popd
    
    sleep 5
    cat $REPO_ROOT/metro.log
else
    # prompt for LogBox setting
    echo "ui: starting react-native metro bundler"
    
    # This is so we can restart metro with LogBox enabled if it is useful for development
    echo "Run metro with LogBox enabled? Type y to enable LogBox for development -- will proceed after 10 seconds with default (LogBox disabled)"
    if read -t 10 -r response; then
        case $response in
            [Yy]* ) 
                echo "Running metro with LogBox enabled..."
                export ENABLE_LOGBOX=1
                ;;
            * ) 
                echo "Running metro with LogBox disabled..."
                export ENABLE_LOGBOX=0
                ;;
        esac
    else
        echo ""
        echo "No response - running metro with LogBox disabled... (default)"
        export ENABLE_LOGBOX=0
    fi
    
    pushd $REPO_ROOT/ui/native
    yarn start
    popd
fi
