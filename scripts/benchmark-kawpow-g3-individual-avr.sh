#!/usr/bin/env bash
set -euo pipefail

count="${1:?Usage: $0 count /absolute/report.json [seed]}"
report="${2:?Usage: $0 count /absolute/report.json [seed]}"
seed="${3:-g3-individual}"
rpc_url="${RPC_URL:-http://127.0.0.1:8545}"
contract="${AVR_ANCHOR_ADDRESS:?Set AVR_ANCHOR_ADDRESS.}"
sender="${SENDER_ADDRESS:?Set SENDER_ADDRESS.}"
foundry_bin="${FOUNDRY_BIN:-/root/.foundry/bin}"
keystore_dir="${KEYSTORE_DIR:?Set KEYSTORE_DIR.}"
password_file="${KEYSTORE_PASSWORD_FILE:?Set KEYSTORE_PASSWORD_FILE.}"

[[ "$count" =~ ^[1-9][0-9]*$ ]] || { echo "Count must be positive." >&2; exit 2; }
[[ "$report" == /* && ! -e "$report" ]] || { echo "Report must be an unused absolute path." >&2; exit 2; }
keystore="$(find "$keystore_dir" -maxdepth 1 -type f -print -quit)"
[[ -n "$keystore" && -f "$password_file" ]] || { echo "Disposable keystore or password file is missing." >&2; exit 2; }

transactions="$(mktemp)"
confirmed="$(mktemp)"
trap 'rm -f "$transactions" "$confirmed"' EXIT
nonce="$($foundry_bin/cast nonce "$sender" --block pending --rpc-url "$rpc_url")"
started_ns="$(date +%s%N)"
for ((index=0; index<count; index++)); do
  receipt_id="$($foundry_bin/cast keccak "$seed:receipt:$index")"
  commitments_root="$($foundry_bin/cast keccak "$seed:commitments:$index")"
  tx_hash="$($foundry_bin/cast send "$contract" 'anchorReceipt(bytes32,bytes32,string)' \
    "$receipt_id" "$commitments_root" '0.2.0-g3' --rpc-url "$rpc_url" \
    --keystore "$keystore" --password-file "$password_file" --nonce "$nonce" --legacy --async)"
  printf '%s\t%s\t%s\n' "$nonce" "$tx_hash" "$(date +%s%N)" >> "$transactions"
  nonce=$((nonce + 1))
done
broadcast_done_ns="$(date +%s%N)"

while IFS=$'\t' read -r tx_nonce tx_hash submitted_ns; do
  receipt="$($foundry_bin/cast receipt "$tx_hash" --rpc-url "$rpc_url")"
  block_number="$(awk '$1 == "blockNumber" {print $2; exit}' <<<"$receipt")"
  gas_used="$(awk '$1 == "gasUsed" {print $2; exit}' <<<"$receipt")"
  status="$(awk '$1 == "status" {print $2; exit}' <<<"$receipt")"
  [[ "$status" == 1 ]] || { echo "Transaction failed: $tx_hash" >&2; exit 1; }
  printf '%s\t%s\t%s\t%s\t%s\n' "$tx_nonce" "$tx_hash" "$submitted_ns" "$block_number" "$gas_used" >> "$confirmed"
done < "$transactions"
confirmed_ns="$(date +%s%N)"

python3 - "$report" "$count" "$seed" "$contract" "$started_ns" "$broadcast_done_ns" "$confirmed_ns" "$confirmed" <<'PY'
import json, statistics, sys
report, count, seed, contract, start, broadcast, confirmed, records_path = sys.argv[1:]
records = []
for line in open(records_path, encoding="utf-8"):
    nonce, tx_hash, submitted, block, gas = line.rstrip("\n").split("\t")
    records.append({"nonce": int(nonce), "transactionHash": tx_hash, "submittedNs": int(submitted),
                    "blockNumber": int(block), "gasUsed": int(gas)})
count, start, broadcast, confirmed = map(int, (count, start, broadcast, confirmed))
broadcast_s = (broadcast-start)/1e9
confirmed_s = (confirmed-start)/1e9
result = {"schema":"aichain.g3-individual-avr-benchmark","schemaVersion":"0.1.0-draft",
          "scope":"disposable two-node KawPoW G3 network","seed":seed,"contract":contract,
          "transactionCount":count,"logicalReceiptCount":count,"broadcastSeconds":broadcast_s,
          "allConfirmedSeconds":confirmed_s,"broadcastTransactionTps":count/broadcast_s,
          "allConfirmedTransactionTps":count/confirmed_s,"allConfirmedLogicalReceiptTps":count/confirmed_s,
          "blocksUsed":sorted({r["blockNumber"] for r in records}),
          "meanGasUsed":statistics.mean(r["gasUsed"] for r in records),"transactions":records}
with open(report,"x",encoding="utf-8") as handle: json.dump(result,handle,indent=2)
print(json.dumps({k:result[k] for k in ("transactionCount","broadcastTransactionTps","allConfirmedTransactionTps")},indent=2))
PY

