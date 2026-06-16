#!/usr/bin/env bash
# Build then launch the dev fed.

set -e

if [ -n "$FEDI_DISABLE_REMOTE_BRIDGE" ]
then
  exit 0
fi

REPO_ROOT=$(git rev-parse --show-toplevel)

"$REPO_ROOT/scripts/bridge/build-remote.sh"
exec "$REPO_ROOT/scripts/bridge/launch-remote.sh" "$@"
