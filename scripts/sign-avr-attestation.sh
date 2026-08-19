#!/usr/bin/env bash
# Sign and cryptographically verify a prototype AVR attestation sidecar.
# Usage: bash ./scripts/sign-avr-attestation.sh path/to/receipt.json [output.json]

set -euo pipefail

if [[ $# -lt 1 || $# -gt 2 ]]; then
    echo "Usage: $0 path/to/receipt.json [output-attestation.json]" >&2
    exit 1
fi

readonly RECEIPT_FILE="$1"
readonly OUTPUT_FILE="${2:-${RECEIPT_FILE}.attestation.json}"
readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
readonly REPO_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

if [[ ! -f "$RECEIPT_FILE" ]]; then
    echo "Receipt file not found: $RECEIPT_FILE" >&2
    exit 1
fi
if [[ -e "$OUTPUT_FILE" ]]; then
    echo "Refusing to overwrite existing attestation: $OUTPUT_FILE" >&2
    exit 1
fi
if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

mapfile -t fields < <(PYTHONPATH="$REPO_ROOT/sdk/python" python3 - "$RECEIPT_FILE" <<'PY'
import json
import sys
from receipt import prepare_attestation

with open(sys.argv[1], encoding="utf-8") as file:
    attestation = prepare_attestation(json.load(file))
for key in ("receiptId", "issuer", "message"):
    print(attestation[key] or "")
PY
)

readonly RECEIPT_ID="${fields[0]}"
readonly ISSUER="${fields[1]}"
readonly MESSAGE="${fields[2]}"
if [[ -z "$ISSUER" ]]; then
    echo "Receipt must include an issuer to create an attestation." >&2
    exit 1
fi

echo "Receipt ID: $RECEIPT_ID"
echo "Claimed issuer: $ISSUER"
echo "Signature scheme: EIP-191 personal sign"

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

signature="$("$FOUNDRY_BIN/cast" wallet sign "$MESSAGE" --keystore "$keystore" --password-file "$password_file")"
"$FOUNDRY_BIN/cast" wallet verify --address "$ISSUER" "$MESSAGE" "$signature" >/dev/null

python3 - "$OUTPUT_FILE" "$RECEIPT_ID" "$ISSUER" "$MESSAGE" "$signature" <<'PY'
import json
import sys

with open(sys.argv[1], "x", encoding="utf-8") as file:
    json.dump({
        "schema": "aichain.avr-attestation",
        "schemaVersion": "0.1.0-draft",
        "scheme": "eip191-personal-sign",
        "receiptId": sys.argv[2],
        "issuer": sys.argv[3],
        "message": sys.argv[4],
        "signature": sys.argv[5],
    }, file, indent=2)
    file.write("\n")
PY

echo "Signature verified for $ISSUER"
echo "Attestation written to: $OUTPUT_FILE"
