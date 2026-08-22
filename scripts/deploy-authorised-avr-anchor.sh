#!/usr/bin/env bash
# Deploy the development-only AuthorisedAVRAnchor using an encrypted operator keystore.

set -euo pipefail

readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
readonly PROJECT_ROOT="$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)"
readonly CONTRACT_ROOT="$PROJECT_ROOT/contracts/avr-anchor"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly AUTHORITY_REGISTRY_ADDRESS="${AUTHORITY_REGISTRY_ADDRESS:-0xd04D61a6A88f73400933F13A02c7974CE8d877a6}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

if [[ ! -x "$FOUNDRY_BIN/forge" ]]; then
    echo "Foundry forge was not found at $FOUNDRY_BIN/forge." >&2
    exit 1
fi
if ! [[ "$AUTHORITY_REGISTRY_ADDRESS" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "AUTHORITY_REGISTRY_ADDRESS must be an EVM address." >&2
    exit 1
fi

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No deployment keystore found in $KEYSTORE_DIR." >&2
    exit 1
fi

password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT
read -r -s -p "Deployment keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

echo "Deploying AuthorisedAVRAnchor with AuthorityRegistry: $AUTHORITY_REGISTRY_ADDRESS"
cd "$CONTRACT_ROOT"
"$FOUNDRY_BIN/forge" create src/AuthorisedAVRAnchor.sol:AuthorisedAVRAnchor \
    --rpc-url "$RPC_URL" \
    --constructor-args "$AUTHORITY_REGISTRY_ADDRESS" \
    --keystore "$keystore" \
    --password-file "$password_file" \
    --broadcast \
    --legacy

