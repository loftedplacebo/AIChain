#!/usr/bin/env bash
# Anchor a 0.2.0-draft authorised AVR through an agent's encrypted VPS keystore.

set -euo pipefail

if [[ $# -ne 1 ]]; then
    echo "Usage: $0 path/to/authorised-receipt.json" >&2
    exit 1
fi

readonly RECEIPT_FILE="$1"
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
readonly PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly CONTRACT_ADDRESS="${CONTRACT_ADDRESS:?Set CONTRACT_ADDRESS to the deployed AuthorisedAVRAnchor address.}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/agent-1/keystore}"

if [[ ! -f "$RECEIPT_FILE" ]]; then
    echo "Receipt file not found: $RECEIPT_FILE" >&2
    exit 1
fi
if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

mapfile -t fields < <(node - "$PROJECT_ROOT" "$RECEIPT_FILE" <<'NODE'
const fs = require("node:fs");
const projectRoot = process.argv[2];
const receiptPath = process.argv[3];
const { prepareAuthorisedAnchor } = require(`${projectRoot}/sdk/typescript/authorised-receipt.js`);
const prepared = prepareAuthorisedAnchor(JSON.parse(fs.readFileSync(receiptPath, "utf8")));
for (const key of ["receiptId", "commitmentsRoot", "organizationId", "authorityCommitment", "schemaVersion", "issuer"]) console.log(prepared[key]);
NODE
)

readonly RECEIPT_ID="${fields[0]}"
readonly COMMITMENTS_ROOT="${fields[1]}"
readonly ORGANIZATION_ID="${fields[2]}"
readonly AUTHORITY_COMMITMENT="${fields[3]}"
readonly SCHEMA_VERSION="${fields[4]}"
readonly CLAIMED_ISSUER="${fields[5]}"

echo "Receipt ID:            $RECEIPT_ID"
echo "Organisation ID:       $ORGANIZATION_ID"
echo "Authority commitment:  $AUTHORITY_COMMITMENT"
echo "Claimed issuer:        $CLAIMED_ISSUER"
echo "Authorised AVR anchor: $CONTRACT_ADDRESS"
echo
echo "The signing wallet must be the claimed issuer and must have an active matching delegation."

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No agent keystore found in $KEYSTORE_DIR." >&2
    exit 1
fi
password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT
read -r -s -p "Agent keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

"$FOUNDRY_BIN/cast" send "$CONTRACT_ADDRESS" \
    "anchorAuthorisedReceipt(bytes32,bytes32,bytes32,bytes32,string)" \
    "$RECEIPT_ID" "$COMMITMENTS_ROOT" "$ORGANIZATION_ID" "$AUTHORITY_COMMITMENT" "$SCHEMA_VERSION" \
    --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy

