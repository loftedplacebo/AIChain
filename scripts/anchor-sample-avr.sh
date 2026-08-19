#!/usr/bin/env bash
# Submit the committed Phase 1B sample AVR to a localhost-only devnet RPC.
# The password is read privately and written to a short-lived, mode-600 file
# because Foundry's keystore mode requires a password-file path.

set -euo pipefail

readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly CONTRACT_ADDRESS="${CONTRACT_ADDRESS:-0xd2997572F0Ec774B7ae8e936ae440D66a15B8372}"
readonly RECEIPT_ID="0x12513ac64f1855af0978a1ef8770cfda878af5e8fca6151b0f08ba76c482da73"
readonly COMMITMENTS_ROOT="0x56e5f4534cf10e7fdfe0fa466072ba996d7d8fa9896ad746895ff1ff5bd6823b"
readonly SCHEMA_VERSION="0.1.0-draft"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

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
