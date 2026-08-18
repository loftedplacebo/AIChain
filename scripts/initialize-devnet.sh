#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${1:-$project_root/devnet/node-1}"
genesis_path="${GENESIS_PATH:-$project_root/config/devnet/genesis.json}"
prefunded_address="${PREFUNDED_ADDRESS:-}"
node_binary="${NODE_BINARY:-$project_root/bin/core-geth}"

if [[ ! -x "$node_binary" ]]; then
  echo "Core-Geth binary not found or not executable at $node_binary." >&2
  exit 1
fi
if [[ ! -f "$genesis_path" ]]; then
  echo "Genesis file not found at $genesis_path." >&2
  exit 1
fi
if [[ -e "$data_dir/geth" ]]; then
  echo "A chain database already exists at $data_dir. Use a new directory or deliberately remove development-only data." >&2
  exit 1
fi

mkdir -p "$data_dir"
resolved_genesis="$data_dir/genesis.json"

if [[ -n "$prefunded_address" ]]; then
  if [[ ! "$prefunded_address" =~ ^0x[0-9a-fA-F]{40}$ ]]; then
    echo "PREFUNDED_ADDRESS must be a 0x-prefixed, 40-hex-character address." >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required when PREFUNDED_ADDRESS is set." >&2
    exit 1
  fi
  jq --arg address "$prefunded_address" '.alloc[$address] = { balance: "0x3635c9adc5dea00000" }' "$genesis_path" > "$resolved_genesis"
else
  cp "$genesis_path" "$resolved_genesis"
fi

"$node_binary" --datadir "$data_dir" init "$resolved_genesis"
echo "Initialized development-only devnet data directory: $data_dir"
if [[ -z "$prefunded_address" ]]; then
  echo "Warning: no account was pre-funded. Create an account and initialize a fresh data directory with PREFUNDED_ADDRESS before testing transactions." >&2
fi
