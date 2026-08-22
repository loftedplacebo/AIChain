#!/usr/bin/env bash
# Register the synthetic development organisation and append a laptop-agent delegation epoch.

set -euo pipefail

readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly REGISTRY_ADDRESS="${REGISTRY_ADDRESS:?Set REGISTRY_ADDRESS to the deployed HistoricalAuthorityRegistry address.}"
readonly ORGANIZATION_ID="${ORGANIZATION_ID:-0x7550d2eadaa6602b06879e581f21ec46469c1325f4a5731e7db99ea9e677141a}"
readonly AUTHORITY_COMMITMENT="${AUTHORITY_COMMITMENT:-0x5a4e0654d0c7b9b2c8e3c40bae47e94b95b81aad794c5a7ccafa82a516b56bb4}"
readonly AGENT_ADDRESS="${AGENT_ADDRESS:-0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7}"
readonly VALIDITY_SECONDS="${VALIDITY_SECONDS:-2592000}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
[[ -n "$keystore" ]] || { echo "No controller keystore found." >&2; exit 1; }
valid_after="$($FOUNDRY_BIN/cast block latest --field timestamp --rpc-url "$RPC_URL")"
valid_until=$((valid_after + VALIDITY_SECONDS))
echo "Historical registry: $REGISTRY_ADDRESS"
echo "Organisation:        $ORGANIZATION_ID"
echo "Laptop agent:        $AGENT_ADDRESS"

password_file="$(mktemp)"; chmod 600 "$password_file"; trap 'rm -f "$password_file"' EXIT
read -r -s -p "Controller keystore password: " password; echo; printf '%s' "$password" > "$password_file"; unset password

echo "Registering historical organisation..."
"$FOUNDRY_BIN/cast" send "$REGISTRY_ADDRESS" "registerOrganization(bytes32)" "$ORGANIZATION_ID" \
  --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy
echo "Authorising laptop agent epoch..."
"$FOUNDRY_BIN/cast" send "$REGISTRY_ADDRESS" "authoriseAgent(bytes32,address,bytes32,uint64,uint64)" \
  "$ORGANIZATION_ID" "$AGENT_ADDRESS" "$AUTHORITY_COMMITMENT" "$valid_after" "$valid_until" \
  --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy
echo "Epoch count:"
"$FOUNDRY_BIN/cast" call "$REGISTRY_ADDRESS" "delegationEpochCount(bytes32,address)(uint256)" \
  "$ORGANIZATION_ID" "$AGENT_ADDRESS" --rpc-url "$RPC_URL"

