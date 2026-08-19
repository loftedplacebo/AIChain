#!/usr/bin/env bash
# Anchor any Phase 1B prototype receipt JSON using the VPS devnet keystore.
# Usage: bash ./scripts/anchor-avr.sh path/to/receipt.json

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 path/to/receipt.json" >&2
    exit 1
fi

readonly RECEIPT_FILE="$1"
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
readonly REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-0xd2997572F0Ec774B7ae8e936ae440D66a15B8372}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

if [[ ! -f "$RECEIPT_FILE" ]]; then
    echo "Receipt file not found: $RECEIPT_FILE" >&2
    exit 1
fi
if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

mapfile -t anchor_fields < <(PYTHONPATH="$REPO_ROOT/sdk/python" python3 - "$RECEIPT_FILE" <<'PY'
import json
import sys
from receipt import prepare_anchor

with open(sys.argv[1], encoding="utf-8") as file:
    anchor = prepare_anchor(json.load(file))
for key in ("receiptId", "commitmentsRoot", "schemaVersion", "claimedIssuer"):
    print(anchor[key] or "")
PY
)

readonly RECEIPT_ID="${anchor_fields[0]}"
readonly COMMITMENTS_ROOT="${anchor_fields[1]}"
readonly SCHEMA_VERSION="${anchor_fields[2]}"
readonly CLAIMED_ISSUER="${anchor_fields[3]}"

if [[ -z "$RECEIPT_ID" || -z "$COMMITMENTS_ROOT" || -z "$SCHEMA_VERSION" ]]; then
    echo "Receipt must provide schemaVersion and valid commitment fields." >&2
    exit 1
fi

echo "Receipt ID:        $RECEIPT_ID"
echo "Commitments root:  $COMMITMENTS_ROOT"
echo "Schema version:    $SCHEMA_VERSION"
echo "Claimed issuer:    ${CLAIMED_ISSUER:-<none>}"
echo "Contract:          $CONTRACT_ADDRESS"
echo
echo "The contract records the signing account as issuer. Ensure it matches the claimed issuer where that claim matters."

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No keystore file found in $KEYSTORE_DIR." >&2
    exit 1
fi

password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT

read -r -s -p "Keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

"$FOUNDRY_BIN/cast" send "$CONTRACT_ADDRESS" \
    "anchorReceipt(bytes32,bytes32,string)" \
    "$RECEIPT_ID" \
    "$COMMITMENTS_ROOT" \
    "$SCHEMA_VERSION" \
    --rpc-url "$RPC_URL" \
    --keystore "$keystore" \
    --password-file "$password_file" \
    --legacy
