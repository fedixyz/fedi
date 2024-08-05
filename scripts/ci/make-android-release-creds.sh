#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

ENCODED_KEYSTORE_FILE_PATH=$REPO_ROOT/tmp/android-keystore-file.txt
ENCODED_KEYSTORE_PROPERTIES_PATH=$REPO_ROOT/tmp/android-keystore-properties.txt
ENCODED_CREDENTIALS_PATH=$REPO_ROOT/tmp/service-account-credentials.txt

DECODED_KEYSTORE_FILE_PATH=$REPO_ROOT/ui/native/android/app/fedi-android-prod.jks
DECODED_KEYSTORE_PROPERTIES_PATH=$REPO_ROOT/ui/native/android/keystore.properties
DECODED_CREDENTIALS_PATH=$REPO_ROOT/ui/native/android/decoded-service-account-credentials.json

$REPO_ROOT/scripts/enforce-nix.sh

mkdir $REPO_ROOT/tmp

echo "Decoding credentials needed for release build + Google Play Store upload..."

echo "$ANDROID_KEYSTORE_FILE_ENCODED" >> "$ENCODED_KEYSTORE_FILE_PATH"
base64 --decode "$ENCODED_KEYSTORE_FILE_PATH" >> "$DECODED_KEYSTORE_FILE_PATH"

echo "$ANDROID_KEYSTORE_PROPERTIES_ENCODED" >> "$ENCODED_KEYSTORE_PROPERTIES_PATH"
base64 --decode "$ENCODED_KEYSTORE_PROPERTIES_PATH" >> "$DECODED_KEYSTORE_PROPERTIES_PATH"

echo "$PLAY_STORE_JSON_CREDENTIALS_ENCODED" >> "$ENCODED_CREDENTIALS_PATH"
base64 --decode "$ENCODED_CREDENTIALS_PATH" >> "$DECODED_CREDENTIALS_PATH"

echo "Cleaning up..."
rm -rf $REPO_ROOT/tmp
