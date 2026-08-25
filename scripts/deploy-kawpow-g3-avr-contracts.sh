#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpc_url="${RPC_URL:-http://127.0.0.1:8545}"
foundry_bin="${FOUNDRY_BIN:-/root/.foundry/bin}"
keystore_dir="${KEYSTORE_DIR:?Set KEYSTORE_DIR to the disposable G3 keystore directory.}"
password_file="${KEYSTORE_PASSWORD_FILE:?Set KEYSTORE_PASSWORD_FILE to the disposable G3 password file.}"
output_env="${1:?Usage: $0 /absolute/output.env}"

[[ "$output_env" == /* ]] || { echo "Output path must be absolute." >&2; exit 2; }
[[ ! -e "$output_env" ]] || { echo "Refusing to overwrite: $output_env" >&2; exit 2; }
[[ -x "$foundry_bin/forge" ]] || { echo "Foundry forge is missing: $foundry_bin/forge" >&2; exit 2; }
[[ -f "$password_file" ]] || { echo "Password file is missing: $password_file" >&2; exit 2; }
keystore="$(find "$keystore_dir" -maxdepth 1 -type f -print -quit)"
[[ -n "$keystore" ]] || { echo "No G3 keystore found in $keystore_dir" >&2; exit 2; }

deploy() {
  local contract="$1"
  "$foundry_bin/forge" create "$contract" \
    --root "$project_root/contracts/avr-anchor" \
    --rpc-url "$rpc_url" --keystore "$keystore" --password-file "$password_file" \
    --broadcast --legacy | sed -n 's/^Deployed to: *//p' | tail -1
}

avr_address="$(deploy src/AVRAnchor.sol:AVRAnchor)"
batch_address="$(deploy src/ReceiptBatchAnchor.sol:ReceiptBatchAnchor)"
[[ "$avr_address" =~ ^0x[0-9a-fA-F]{40}$ && "$batch_address" =~ ^0x[0-9a-fA-F]{40}$ ]] || {
  echo "Could not parse deployed G3 contract addresses." >&2
  exit 1
}
cat > "$output_env" <<EOF
G3_AVR_ANCHOR_ADDRESS=$avr_address
G3_BATCH_ANCHOR_ADDRESS=$batch_address
EOF
chmod 600 "$output_env"
cat "$output_env"

