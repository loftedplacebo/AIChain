#!/usr/bin/env bash
# Submit deterministic synthetic receipt-ID batches and report confirmed TPS.
# Usage: bash ./scripts/benchmark-batch-anchor.sh manifest.json output-report.json

set -euo pipefail

if [[ $# -ne 2 ]]; then
    echo "Usage: $0 manifest.json output-report.json" >&2
    exit 1
fi

readonly MANIFEST="$1"
readonly REPORT="$2"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly BATCH_ANCHOR_ADDRESS="${BATCH_ANCHOR_ADDRESS:?Set BATCH_ANCHOR_ADDRESS to the deployed ReceiptBatchAnchor address.}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"
readonly KEYSTORE_DIR="${KEYSTORE_DIR:-/opt/aichain/devnet/node-1/keystore}"

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

keystore="$(find "$KEYSTORE_DIR" -maxdepth 1 -type f -print -quit)"
if [[ -z "$keystore" ]]; then
    echo "No keystore file found in $KEYSTORE_DIR." >&2
    exit 1
fi

password_file="$(mktemp)"
chmod 600 "$password_file"
trap 'rm -f "$password_file"' EXIT
read -r -s -p "Keystore password: " keystore_password
echo
printf '%s' "$keystore_password" > "$password_file"
unset keystore_password

started_ns="$(date +%s%N)"
batch_count=0
receipt_count=0
records_file="$(mktemp)"
trap 'rm -f "$password_file" "$records_file"' EXIT

while IFS= read -r batch_json; do
    mapfile -t leaves < <(python3 -c 'import json,sys; print("\n".join(json.loads(sys.stdin.read())))' <<<"$batch_json")
    root="$(merkle_root "${leaves[@]}")"
    leaf_count="${#leaves[@]}"
    submitted_ns="$(date +%s%N)"
    receipt="$($FOUNDRY_BIN/cast send "$BATCH_ANCHOR_ADDRESS" \
        "anchorBatch(bytes32,uint64,string)" "$root" "$leaf_count" "0.1.0-draft" \
        --rpc-url "$RPC_URL" --keystore "$keystore" --password-file "$password_file" --legacy)"
    completed_ns="$(date +%s%N)"
    transaction_hash="$(awk '/transactionHash/{print $2; exit}' <<<"$receipt")"
    gas_used="$(awk '/gasUsed/{print $2; exit}' <<<"$receipt")"
    printf '%s\t%s\t%s\t%s\t%s\n' "$root" "$leaf_count" "$transaction_hash" "$gas_used" "$((completed_ns - submitted_ns))" >> "$records_file"
    ((batch_count += 1))
    ((receipt_count += leaf_count))
done < <(python3 - "$MANIFEST" <<'PY'
import json
import sys
for batch in json.load(open(sys.argv[1], encoding="utf-8"))["batches"]:
    print(json.dumps(batch))
PY
)

finished_ns="$(date +%s%N)"
elapsed_ns="$((finished_ns - started_ns))"
python3 - "$REPORT" "$MANIFEST" "$BATCH_ANCHOR_ADDRESS" "$batch_count" "$receipt_count" "$elapsed_ns" "$records_file" <<'PY'
import json
import sys

report, manifest_path, contract, batches, receipts, elapsed_ns, records_path = sys.argv[1:]
records = []
for line in open(records_path, encoding="utf-8"):
    root, leaves, tx_hash, gas, latency_ns = line.rstrip("\n").split("\t")
    records.append({"batchRoot": root, "leafCount": int(leaves), "transactionHash": tx_hash,
                    "gasUsed": int(gas), "submissionLatencyMs": int(latency_ns) / 1_000_000})
elapsed_seconds = int(elapsed_ns) / 1_000_000_000
manifest = json.load(open(manifest_path, encoding="utf-8"))
json.dump({
    "schema": "aichain.capacity-benchmark-report",
    "schemaVersion": "0.1.0-draft",
    "scope": "single-node serial confirmed baseline; not P2P or public-network TPS",
    "batchAnchor": contract,
    "receiptCount": int(receipts),
    "batchTransactionCount": int(batches),
    "configuredBatchSize": manifest["batchSize"],
    "elapsedSeconds": elapsed_seconds,
    "confirmedTransactionTps": int(batches) / elapsed_seconds if elapsed_seconds else None,
    "confirmedLogicalReceiptTps": int(receipts) / elapsed_seconds if elapsed_seconds else None,
    "batches": records,
}, open(report, "x", encoding="utf-8"), indent=2)
PY

echo "Confirmed transaction TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['confirmedTransactionTps'])")"
echo "Confirmed logical receipt TPS: $(python3 -c "import json; print(json.load(open('$REPORT'))['confirmedLogicalReceiptTps'])")"
echo "Report written to: $REPORT"
