#!/usr/bin/env bash

while getopts n: flag
do
    case "${flag}" in
        n) network=${OPTARG};;
        *) ;;
    esac
done

FEDERATION_CODE=""
case "$network" in
    "regtest")
        FEDERATION_CODE=$REGTEST
        ;;
    "mainnet")
        # FEDERATION_CODE=$MAINNET
        echo "No mainnet tests yet!"
        exit 0
        ;;
    *)
        echo "Invalid network specified. Please use -n regtest or -n mainnet."
        exit 1
        ;;
esac

echo "Running Detox grey-box tests on network: $network"
echo "Testing with federation: $FEDERATION_CODE"

# This makes sure the federation code is accessible in our test files
# with process.env.FEDERATION_CODE
export FEDERATION_CODE

# Build the app binary first
detox build --if-missing --configuration android.emu.debug
# Run Detox tests in headless mode
detox test --headless --configuration android.emu.debug
