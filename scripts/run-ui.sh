#!/usr/bin/env bash

export FM_BITCOIN_NETWORK="regtest"
export FM_UI_KIND=${1:-"old"}
export FM_FED_SIZE=${2:-2}
export FM_FED_NAME=${3:-"Cypherpunk Federation"}

source scripts/build.sh $FM_FED_SIZE
cargo build ${CARGO_PROFILE:+--profile ${CARGO_PROFILE}}
export PATH="$FM_BIN_DIR:$PATH"

tail -n +0 -F $FM_LOGS_DIR/fedimintd-0.log &
echo $! >> $FM_PID_FILE
tail -n +0 -F $FM_LOGS_DIR/fedimintd-1.log &
echo $! >> $FM_PID_FILE

devi run-ui $FM_UI_KIND
