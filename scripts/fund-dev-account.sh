#!/usr/bin/env bash
# Fund a development-only account from the VPS controller account.
# Usage: bash ./scripts/fund-dev-account.sh 0xRecipientAddress

set -euo pipefail

if [[ $# -ne 1 || ! "$1" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "Usage: $0 0xRecipientAddress" >&2
    exit 1
fi

readonly RECIPIENT_ADDRESS="$1"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"
readonly FUND_AMOUNT="${FUND_AMOUNT:-1ether}"

if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No controller keystore file found in $KEYSTORE_DIR." >&2
    exit 1
fi

echo "Funding development account $RECIPIENT_ADDRESS with $FUND_AMOUNT of temporary devnet currency."
password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT
read -r -s -p "Controller keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

"$FOUNDRY_BIN/cast" send "$RECIPIENT_ADDRESS" --value "$FUND_AMOUNT" \
    --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy
