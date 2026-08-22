#!/usr/bin/env bash
set -euo pipefail
ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"
REGISTRY_ADDRESS="${REGISTRY_ADDRESS:?Set REGISTRY_ADDRESS to the deployed HistoricalAuthorityRegistry address.}"
keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
[[ -n "$keystore" ]] || { echo "No controller keystore found." >&2; exit 1; }
password_file="$(mktemp)"; chmod 600 "$password_file"; trap 'rm -f "$password_file"' EXIT
read -r -s -p "Controller keystore password: " password; echo; printf '%s' "$password" > "$password_file"; unset password
cd "$ROOT/contracts/avr-anchor"
"$FOUNDRY_BIN/forge" create src/HistoricalAuthorisedAVRAnchor.sol:HistoricalAuthorisedAVRAnchor \
  --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --broadcast --legacy \
  --constructor-args "$REGISTRY_ADDRESS"

