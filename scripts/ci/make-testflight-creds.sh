#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)
ENCODED_CREDENTIALS_PATH=$REPO_ROOT/tmp/asc-api-key-credentials.txt
DECODED_CREDENTIALS_PATH=$REPO_ROOT/ui/native/ios/decoded-asc-api-key-credentials.json

$REPO_ROOT/scripts/enforce-nix.sh

mkdir $REPO_ROOT/tmp

echo "Decoding App Store Connect JSON credentials..."

echo ${ASC_API_KEY_JSON_CREDENTIALS_ENCODED} >> $ENCODED_CREDENTIALS_PATH
base64 --decode $ENCODED_CREDENTIALS_PATH >> $DECODED_CREDENTIALS_PATH

echo "Cleaning up..."
rm -rf $REPO_ROOT/tmp
