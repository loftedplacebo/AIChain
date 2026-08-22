#!/usr/bin/env bash
# Verify a versioned AVR fixture against its deployed Phase 1B anchor without signing.
# Usage: bash ./scripts/verify-avr-lifecycle.sh [receipt-json]

set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
receipt_path="${1:-$project_root/fixtures/avr/receipt-v0.1.0-draft.json}"
rpc_url="${RPC_URL:-http://127.0.0.1:8545}"
contract_address="${CONTRACT_ADDRESS:-0xd2997572F0Ec774B7ae8e936ae440D66a15B8372}"
foundry_bin="${FOUNDRY_BIN:-/root/.foundry/bin}"

if [[ ! -f "$receipt_path" ]]; then
  echo "Receipt fixture not found: $receipt_path" >&2
  exit 1
fi
if [[ ! -x "$foundry_bin/cast" ]]; then
  echo "Foundry cast was not found at $foundry_bin/cast." >&2
  exit 1
fi

temp_dir="$(mktemp -d)"
derived_json="$temp_dir/derived.json"
anchor_json="$temp_dir/anchor.json"
trap 'rm -f "$derived_json" "$anchor_json"; rmdir "$temp_dir"' EXIT

PYTHONPATH="$project_root/sdk/python" python3 "$project_root/sdk/python/avr_cli.py" derive "$receipt_path" > "$derived_json"
receipt_id="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["receiptId"])' "$derived_json")"

"$foundry_bin/cast" call --json "$contract_address" \
  'getAnchor(bytes32)((address,bytes32,uint64,string))' "$receipt_id" --rpc-url "$rpc_url" \
  | python3 -c '
import json, sys
issuer, commitments_root, included_at, schema_version = json.load(sys.stdin)[0]
json.dump({"issuer": issuer, "commitmentsRoot": commitments_root, "includedAt": included_at,
           "schemaVersion": schema_version}, sys.stdout)
' > "$anchor_json"

verification="$(PYTHONPATH="$project_root/sdk/python" python3 "$project_root/sdk/python/avr_cli.py" verify-anchor "$receipt_path" "$anchor_json")"
python3 -c '
import json, sys
result = json.loads(sys.argv[1])
if not result["valid"]:
    raise SystemExit("AVR lifecycle verification failed: " + json.dumps(result))
print("AVR lifecycle verified:", json.dumps(result, sort_keys=True))
' "$verification"
