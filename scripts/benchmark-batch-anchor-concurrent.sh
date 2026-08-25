#!/usr/bin/env bash
# Broadcast all benchmark batches before waiting for confirmations.
# Usage: BATCH_ANCHOR_ADDRESS=0x... bash ./scripts/benchmark-batch-anchor-concurrent.sh manifest.json output-report.json

set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 manifest.json output-report.json" >&2
    exit 1
fi

readonly MANIFEST="$1"
readonly REPORT="$2"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly BATCH_ANCHOR_ADDRESS="${BATCH_ANCHOR_ADDRESS:?Set BATCH_ANCHOR_ADDRESS to the deployed ReceiptBatchAnchor address.}"
readonly SENDER_ADDRESS="${SENDER_ADDRESS:-0xccF9f75DdbDC548eaDeF8aC3CA5EA18B10fD71CE}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"
readonly BENCHMARK_SCOPE="${BENCHMARK_SCOPE:-single-node concurrent broadcast baseline; not P2P or public-network TPS}"

if [[ ! -f "$MANIFEST" ]]; then
    echo "Manifest file not found: $MANIFEST" >&2
    exit 1
fi
if [[ -e "$REPORT" ]]; then
    echo "Refusing to overwrite existing report: $REPORT" >&2
    exit 1
fi

merkle_root() {
    local -a level=("$@")
    while ((${#level[@]} > 1)); do
        local -a next=()
        local index=0
        while ((index < ${#level[@]})); do
            local left="${level[index]}"
            local right="${level[index + 1]:-$left}"
            if [[ "$right" < "$left" ]]; then
                local swap="$left"; left="$right"; right="$swap"
            fi
            next+=("$($FOUNDRY_BIN/cast keccak "0x${left:2}${right:2}")")
            ((index += 2))
        done
        level=("${next[@]}")
    done
    printf '%s\n' "${level[0]}"
}

prepared_file="$(mktemp)"
transactions_file="$(mktemp)"
cleanup_password_file=false
trap 'rm -f "$prepared_file" "$transactions_file"; [[ "$cleanup_password_file" == true ]] && rm -f "${password_file:-}"' EXIT

root_started_ns="$(date +%s%N)"
receipt_count=0
while IFS= read -r batch_json; do
    mapfile -t leaves < <(python3 -c 'import json,sys; print("\n".join(json.loads(sys.stdin.read())))' <<<"$batch_json")
    root="$(merkle_root "${leaves[@]}")"
    printf '%s\t%s\n' "$root" "${#leaves[@]}" >> "$prepared_file"
    ((receipt_count += ${#leaves[@]}))
done < <(python3 - "$MANIFEST" <<'PY'
import json
import sys
for batch in json.load(open(sys.argv[1], encoding="utf-8"))["batches"]:
    print(json.dumps(batch))
PY
)
root_finished_ns="$(date +%s%N)"

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No keystore file found in $KEYSTORE_DIR." >&2
    exit 1
fi
if [[ -n "${KEYSTORE_PASSWORD_FILE:-}" ]]; then
    password_file="$KEYSTORE_PASSWORD_FILE"
    [[ -f "$password_file" ]] || { echo "Password file not found: $password_file" >&2; exit 1; }
else
    password_file="$(mktemp)"
    chmod 600 "$password_file"
    cleanup_password_file=true
    read -r -s -p "Keystore password: " keystore_password
    echo
    printf '%s' "$keystore_password" > "$password_file"
    unset keystore_password
fi

nonce="$($FOUNDRY_BIN/cast nonce "$SENDER_ADDRESS" --block pending --rpc-url "$RPC_URL")"
batch_count=0
broadcast_started_ns="$(date +%s%N)"
while IFS=$'\t' read -r root leaf_count; do
    transaction_hash="$($FOUNDRY_BIN/cast send "$BATCH_ANCHOR_ADDRESS" \
        "anchorBatch(bytes32,uint64,string)" "$root" "$leaf_count" "0.1.0-draft" \
        --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" \
        --nonce "$nonce" --legacy --async)"
    printf '%s\t%s\t%s\t%s\n' "$root" "$leaf_count" "$nonce" "$transaction_hash" >> "$transactions_file"
    nonce=$((nonce + 1))
    ((batch_count += 1))
done < "$prepared_file"
broadcast_finished_ns="$(date +%s%N)"

confirmed_file="$(mktemp)"
trap 'rm -f "$prepared_file" "$transactions_file" "$confirmed_file"; [[ "$cleanup_password_file" == true ]] && rm -f "${password_file:-}"' EXIT
while IFS=$'\t' read -r root leaf_count transaction_nonce transaction_hash; do
    receipt="$($FOUNDRY_BIN/cast receipt "$transaction_hash" --rpc-url "$RPC_URL")"
    block_number="$(awk '$1 == "blockNumber" {print $2; exit}' <<<"$receipt")"
    gas_used="$(awk '$1 == "gasUsed" {print $2; exit}' <<<"$receipt")"
    status="$(awk '$1 == "status" {print $2; exit}' <<<"$receipt")"
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$root" "$leaf_count" "$transaction_nonce" "$transaction_hash" "$block_number" "$gas_used" >> "$confirmed_file"
    if [[ "$status" != "1" ]]; then
        echo "Transaction failed: $transaction_hash" >&2
        exit 1
    fi
done < "$transactions_file"
confirmed_finished_ns="$(date +%s%N)"

python3 - "$REPORT" "$MANIFEST" "$BATCH_ANCHOR_ADDRESS" "$batch_count" "$receipt_count" \
    "$((root_finished_ns - root_started_ns))" "$((broadcast_finished_ns - broadcast_started_ns))" \
    "$((confirmed_finished_ns - broadcast_started_ns))" "$confirmed_file" "$BENCHMARK_SCOPE" <<'PY'
import json
import sys

(report, manifest_path, contract, batches, receipts, root_ns, broadcast_ns, confirmation_ns, records_path, scope) = sys.argv[1:]
records = []
for line in open(records_path, encoding="utf-8"):
    root, leaves, nonce, tx_hash, block, gas = line.rstrip("\n").split("\t")
    records.append({"batchRoot": root, "leafCount": int(leaves), "nonce": int(nonce),
                    "transactionHash": tx_hash, "blockNumber": int(block), "gasUsed": int(gas)})
def seconds(value): return int(value) / 1_000_000_000
root_seconds, broadcast_seconds, confirmation_seconds = map(seconds, (root_ns, broadcast_ns, confirmation_ns))
manifest = json.load(open(manifest_path, encoding="utf-8"))
json.dump({
    "schema": "aichain.capacity-benchmark-report",
    "schemaVersion": "0.1.0-draft",
    "scope": scope,
    "batchAnchor": contract,
    "receiptCount": int(receipts), "batchTransactionCount": int(batches),
    "configuredBatchSize": manifest["batchSize"], "seed": manifest.get("seed", ""),
    "rootConstructionSeconds": root_seconds,
    "broadcastSeconds": broadcast_seconds,
    "allConfirmedSecondsFromBroadcast": confirmation_seconds,
    "broadcastTransactionTps": int(batches) / broadcast_seconds if broadcast_seconds else None,
    "broadcastLogicalReceiptTps": int(receipts) / broadcast_seconds if broadcast_seconds else None,
    "allConfirmedTransactionTps": int(batches) / confirmation_seconds if confirmation_seconds else None,
    "allConfirmedLogicalReceiptTps": int(receipts) / confirmation_seconds if confirmation_seconds else None,
    "batches": records,
}, open(report, "x", encoding="utf-8"), indent=2)
PY

echo "Broadcast transaction TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['broadcastTransactionTps'])")"
echo "Broadcast logical receipt TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['broadcastLogicalReceiptTps'])")"
echo "All-confirmed transaction TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['allConfirmedTransactionTps'])")"
echo "All-confirmed logical receipt TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['allConfirmedLogicalReceiptTps'])")"
echo "Report written to: $REPORT"
