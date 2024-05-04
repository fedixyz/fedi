#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

FLAVOR=${FLAVOR:-production}

pushd $REPO_ROOT/ui/native

# Skip this step if running locally... Otherwise
# CI requires these values as outputs for later steps
if [[ -z $GITHUB_OUTPUT ]]; then
  echo "Not running in CI. Skip saving outputs for Github Actions."
else
  echo "Saving APK path + version + latest commit as outputs for next steps in job"
  CURRENT_TIMESTAMP=$(date +"%Y%m%d%H%M")
  COMMIT_HASH="$(git rev-parse HEAD)"
  APK_VERSION="$(npm pkg get version  --ws false | sed 's/"//g')"
  echo "APK_PATH=$REPO_ROOT/ui/native/android/app/build/outputs/apk/$FLAVOR/release/app-$FLAVOR-release-${APK_VERSION}-${CURRENT_TIMESTAMP}-commit-${COMMIT_HASH}.apk" >> $GITHUB_OUTPUT
  echo "APK_VERSION=$(npm pkg get version --ws false | sed 's/"//g')" >> $GITHUB_OUTPUT
fi

popd
