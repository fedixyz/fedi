#!/usr/bin/env bash

source $REPO_ROOT/scripts/common.sh

$REPO_ROOT/scripts/enforce-nix.sh


if [[ "${TMP:-}" == *"/nix-shell."* ]]; then
  FM_TEST_DIR="${2-$TMP}/fm-$(LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c 4 || true)"
else
  FM_TEST_DIR="${2-"$(mktemp --tmpdir -d XXXXX)"}"
fi

export FM_TEST_DIR
export FM_LOGS_DIR="$FM_TEST_DIR/logs"

export FM_FED_SIZE=4
export FM_PID_FILE="$FM_TEST_DIR/.pid"
export FM_LOGS_DIR="$FM_TEST_DIR/logs"

mkdir $FM_TEST_DIR
mkdir $FM_LOGS_DIR
touch $FM_PID_FILE

# FIXME: use build.sh???
cargo build --profile ${CARGO_PROFILE}
export PATH="${CARGO_BIN_DIR}:$PATH"

# Flag to have devimint use binaries in specific folder, e.g. "../fedimint/target/debug"
if [ -n "$DEVIMINT_BIN" ]; then
  export PATH=$DEVIMINT_BIN:$PATH
fi

# social recovery module needs this
export FM_ADMIN_PASSWORD=p

# enable stability pool
export INCLUDE_STABILITY_POOL=1
export USE_STABILITY_POOL_TEST_PARAMS=1

devi dev-fed &> $FM_LOGS_DIR/devimint-outer.log &
echo $! >> $FM_PID_FILE


# Function for killing processes stored in FM_PID_FILE in reverse-order they were created in
function kill_fedimint_processes {
  echo "Killing fedimint processes"
  PIDS=$(cat $FM_PID_FILE | sed '1!G;h;$!d') # sed reverses order
  if [ -n "$PIDS" ]
  then
    kill $PIDS 2>/dev/null
  fi
  rm -f $FM_PID_FILE
}

trap kill_fedimint_processes EXIT

mprocs -c misc/mprocs.yaml
