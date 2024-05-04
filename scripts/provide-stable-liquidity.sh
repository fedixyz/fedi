#!/usr/bin/env bash
echo "Run with './scripts/provide-stable-liquidity.sh [amount_sats]"

# wait for devimint to start
echo "Waiting for fedimint start"
STATUS="$(devi wait)"
if [ "$STATUS" = "ERROR" ]
then
    echo "fedimint didn't start correctly"
    echo "See other panes for errors"
    exit 1
fi

set -euo pipefail

function sat_to_btc() {
    echo "scale=8; $1/100000000" | bc | awk '{printf "%.8f\n", $0}'
}
function sat_to_msat() {
    msat=$(( $1 * 1000 ))
    echo "$msat"
}

AMOUNT=${AMOUNT:-$1}

echo "Pegging in $AMOUNT to deposit-to-provide in stability_pool"

# HACK: fix bitcoin-cli invocation (fixed upstream)
eval "$(devi env)"
FM_BTC_CLIENT="$FM_BTC_CLIENT -rpcport=$FM_PORT_BTC_RPC"

# get a deposit address and save the operation ID
json_output="$($FM_MINT_CLIENT deposit-address)"
PEGIN_ADDRESS=$(echo "$json_output" | jq -r '.address')
OPERATION_ID=$(echo "$json_output" | jq -r '.operation_id')

echo $PEGIN_ADDRESS
echo $OPERATION_ID
echo $AMOUNT
AMOUNT_BTC=$(sat_to_btc $AMOUNT)
AMOUNT_MSATS=$(sat_to_msat $AMOUNT)
# send bitcoin to that address
$FM_BTC_CLIENT sendtoaddress $PEGIN_ADDRESS $AMOUNT_BTC
# wait for confirmation and await deposit
$FM_BTC_CLIENT -generate 11
$FM_MINT_CLIENT await-deposit $OPERATION_ID
# deposit to stability pool
$FM_MINT_CLIENT module stability_pool deposit-to-provide $AMOUNT_MSATS 1000
# check amount is in account
echo "Done... Printing stability pool account info"
$FM_MINT_CLIENT module stability_pool account-info
