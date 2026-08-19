#!/usr/bin/env bash
# Read the first anchored Phase 1B sample receipt. This performs no signing.

set -euo pipefail

readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-0xd2997572F0Ec774B7ae8e936ae440D66a15B8372}"
readonly RECEIPT_ID="0x12513ac64f1855af0978a1ef8770cfda878af5e8fca6151b0f08ba76c482da73"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"

if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

echo "Expected receipt ID:  $RECEIPT_ID"
echo "Expected root:        0x56e5f4534cf10e7fdfe0fa466072ba996d7d8fa9896ad746895ff1ff5bd6823b"
echo "Expected schema:      0.1.0-draft"
echo
echo "Retrieved anchor (issuer, commitments root, inclusion time, schema version):"
"$FOUNDRY_BIN/cast" call "$CONTRACT_ADDRESS" \
    "getAnchor(bytes32)((address,bytes32,uint64,string))" \
    "$RECEIPT_ID" \
    --rpc-url "$RPC_URL"
