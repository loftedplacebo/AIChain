#!/usr/bin/env bash
# Register a labelled demo organisation and delegate a 30-day demo authority to agent-1.
# This is Phase 1B development data only, not a real-world identity claim.

set -euo pipefail

readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly REGISTRY_ADDRESS="${REGISTRY_ADDRESS:-0xd04D61a6A88f73400933F13A02c7974CE8d877a6}"
readonly ORGANIZATION_ID="0x7550d2eadaa6602b06879e581f21ec46469c1325f4a5731e7db99ea9e677141a"
readonly AUTHORITY_COMMITMENT="0x5a4e0654d0c7b9b2c8e3c40bae47e94b95b81aad794c5a7ccafa82a516b56bb4"
readonly AGENT_ADDRESS="0x82F0165D1b77C69978E4127d347023680f685365"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"
readonly VALIDITY_SECONDS="${VALIDITY_SECONDS:-2592000}"

if [[ ! -x "$FOUNDRY_BIN/cast" ]]; then
    echo "Foundry cast was not found at $FOUNDRY_BIN/cast." >&2
    exit 1
fi

valid_after="$($FOUNDRY_BIN/cast block latest --field timestamp --rpc-url "$RPC_URL")"
valid_until=$((valid_after + VALIDITY_SECONDS))

echo "Registry:             $REGISTRY_ADDRESS"
echo "Demo organization ID: $ORGANIZATION_ID"
echo "Demo agent:           $AGENT_ADDRESS"
echo "Authority commitment: $AUTHORITY_COMMITMENT"
echo "Valid after:          $valid_after"
echo "Valid until:          $valid_until"
echo
echo "This will send two controller-signed devnet transactions: register organisation, then authorize agent."

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No controller keystore file found in $KEYSTORE_DIR." >&2
    exit 1
fi

password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT
read -r -s -p "Controller keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

echo "Registering demo organisation..."
"$FOUNDRY_BIN/cast" send "$REGISTRY_ADDRESS" \
    "registerOrganization(bytes32)" "$ORGANIZATION_ID" \
    --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy

echo "Authorizing demo agent..."
"$FOUNDRY_BIN/cast" send "$REGISTRY_ADDRESS" \
    "authorizeAgent(bytes32,address,bytes32,uint64,uint64)" \
    "$ORGANIZATION_ID" "$AGENT_ADDRESS" "$AUTHORITY_COMMITMENT" "$valid_after" "$valid_until" \
    --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy

echo "Active delegation check:"
"$FOUNDRY_BIN/cast" call "$REGISTRY_ADDRESS" \
    "isActive(bytes32,address)(bool)" "$ORGANIZATION_ID" "$AGENT_ADDRESS" \
    --rpc-url "$RPC_URL"
