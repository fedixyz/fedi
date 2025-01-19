#!/usr/bin/env bash

set -e
REPO_ROOT=$(git rev-parse --show-toplevel)

$REPO_ROOT/scripts/enforce-nix.sh

MODE=${MODE:-check}

pushd $REPO_ROOT/ui

if [[ -n "$CI" ]]; then
  echo "Running UI code formatter in CI"
  # Run code formatter
  yarn format
  # Print files with changes
  popd
  CHANGES=$(git status --porcelain)
  if [[ -z $CHANGES ]]
  then
      echo "All UI code is formatted correctly"
  else
      echo "The following files must be formatted. Run 'just format-ui-code' to fix the errors"
      echo "$CHANGES"
      exit 1
  fi
else
  if [[ "$MODE" == "write" ]]; then
    echo "Running UI code formatter to fix formatting errors"
    yarn format
  else
    echo "Running UI code formatter to check for formatting errors"
    yarn format:check
  fi
  popd
fi
