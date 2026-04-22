#!/usr/bin/env bash
# Join a federation and receive ecash on an andy screen.
# Usage: acquire-money.sh [amount_msats]
# Default amount: 100000 msats (100 sats)
# Set ANDY_SCREEN env var to target a specific screen.
set -euo pipefail

AMOUNT="${1:-100000}"
RBRIDGE_HOST="localhost:${REMOTE_BRIDGE_PORT:-26722}"

PACKAGE=$(andy info | jq -r '.assigned_package')
DEVICE_ID="remote-bridge:pkg:${PACKAGE}"

rpc() {
    local method="$1" body="${2:-"{}"}"
    curl -s -X POST "http://${RBRIDGE_HOST}/${DEVICE_ID}/rpc/${method}" \
        -H 'Content-Type: application/json' \
        -d "$body"
}

# Join federation if not already joined
FEDS=$(rpc listFederations | jq -r '.result | length')
if [[ "$FEDS" -eq 0 ]]; then
    INVITE=$(curl -s "http://${RBRIDGE_HOST}/invite_code" | jq -r .invite_code)
    echo "==> Joining federation..."
    rpc joinFederation "{\"inviteCode\":\"$INVITE\",\"recoverFromScratch\":false}" > /dev/null
fi

FED_ID=$(rpc listFederations | jq -r '.result[0].id')

# Generate ecash from dev federation and receive it
ECASH=$(curl -s "http://${RBRIDGE_HOST}/generate_ecash/${AMOUNT}" | jq -r .ecash)

echo "==> Receiving ${AMOUNT} msats..."
RESULT=$(rpc receiveEcash "{\"federationId\":\"$FED_ID\",\"ecash\":\"$ECASH\",\"frontendMetadata\":{\"initialNotes\":null,\"recipientMatrixId\":null,\"senderMatrixId\":null}}")
RECEIVED=$(echo "$RESULT" | jq -r '.result[0]')
echo "==> Received: $RECEIVED msats"
