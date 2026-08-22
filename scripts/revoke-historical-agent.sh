#!/usr/bin/env bash
# Revoke the latest epoch for a development agent in HistoricalAuthorityRegistry.
set -euo pipefail
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly REGISTRY_ADDRESS="${REGISTRY_ADDRESS:?Set REGISTRY_ADDRESS to HistoricalAuthorityRegistry.}"
readonly ORGANIZATION_ID="${ORGANIZATION_ID:-0x7550d2eadaa6602b06879e581f21ec46469c1325f4a5731e7db99ea9e677141a}"
readonly AGENT_ADDRESS="${AGENT_ADDRESS:-0x871252AE9E27BDf8265402a70A0Fb04B55b64dF7}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"
keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"; [[ -n "$keystore" ]] || { echo "No controller keystore found." >&2; exit 1; }
password_file="$(mktemp)"; chmod 600 "$password_file"; trap 'rm -f "$password_file"' EXIT
read -r -s -p "Controller keystore password: " password; echo; printf '%s' "$password" > "$password_file"; unset password
"$FOUNDRY_BIN/cast" send "$REGISTRY_ADDRESS" "revokeLatestAgentEpoch(bytes32,address)" "$ORGANIZATION_ID" "$AGENT_ADDRESS" \
  --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy

