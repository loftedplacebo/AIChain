#!/usr/bin/env bash
# Verify that one receipt ID from a manifest is covered by an anchored Merkle batch root.
# Usage: BATCH_ANCHOR_ADDRESS=0x... bash ./scripts/verify-batch-membership.sh manifest.json batch-index leaf-index

set -euo pipefail

if [[ $# -ne 3 ]]; then
    echo "Usage: $0 manifest.json batch-index leaf-index" >&2
    exit 1
fi

readonly MANIFEST="$1"
readonly BATCH_INDEX="$2"
readonly LEAF_INDEX="$3"
readonly RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
readonly BATCH_ANCHOR_ADDRESS="${BATCH_ANCHOR_ADDRESS:?Set BATCH_ANCHOR_ADDRESS to the deployed ReceiptBatchAnchor address.}"
readonly FOUNDRY_BIN="${FOUNDRY_BIN:-/root/.foundry/bin}"

if [[ ! -f "$MANIFEST" ]]; then
    echo "Manifest file not found: $MANIFEST" >&2
    exit 1
fi
if ! [[ "$BATCH_INDEX" =~ ^[0-9]+$ && "$LEAF_INDEX" =~ ^[0-9]+$ ]]; then
    echo "Batch and leaf indexes must be non-negative integers." >&2
    exit 1
fi

mapfile -t leaves < <(python3 - "$MANIFEST" "$BATCH_INDEX" <<'PY'
import json
import sys

manifest = json.load(open(sys.argv[1], encoding="utf-8"))
index = int(sys.argv[2])
try:
    print("\n".join(manifest["batches"][index]))
except IndexError:
    raise SystemExit("Batch index is outside the manifest")
PY
)

if (( LEAF_INDEX >= ${#leaves[@]} )); then
    echo "Leaf index is outside batch $BATCH_INDEX." >&2
    exit 1
fi

receipt_id="${leaves[LEAF_INDEX]}"
proof=()
index="$LEAF_INDEX"
level=("${leaves[@]}")
while ((${#level[@]} > 1)); do
    sibling_index=$((index ^ 1))
    if (( sibling_index >= ${#level[@]} )); then
        sibling_index="$index"
    fi
    proof+=("${level[sibling_index]}")

    next=()
    cursor=0
    while (( cursor < ${#level[@]} )); do
        left="${level[cursor]}"
        right="${level[cursor + 1]:-$left}"
        if [[ "$right" < "$left" ]]; then
            swap="$left"; left="$right"; right="$swap"
        fi
        next+=("$($FOUNDRY_BIN/cast keccak "0x${left:2}${right:2}")")
        ((cursor += 2))
    done
    level=("${next[@]}")
    index=$((index / 2))
done

batch_root="${level[0]}"
proof_argument="[$(IFS=,; echo "${proof[*]}")]"

echo "Receipt ID:  $receipt_id"
echo "Batch root:  $batch_root"
echo "Proof depth: ${#proof[@]}"
echo "On-chain membership result:"
"$FOUNDRY_BIN/cast" call "$BATCH_ANCHOR_ADDRESS" \
    "verifyMembership(bytes32,bytes32[],bytes32)(bool)" \
    "$receipt_id" "$proof_argument" "$batch_root" \
    --rpc-url "$RPC_URL"
