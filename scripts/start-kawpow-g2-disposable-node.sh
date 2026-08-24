#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
geth_binary="${1:-$project_root/build/core-geth-g2}"
data_dir="${2:-/tmp/aichain-kawpow-g2}"
genesis="$project_root/config/kawpow-g2-disposable-genesis.json"

if [[ "$geth_binary" != /* || "$data_dir" != /* ]]; then
  echo "Binary and data directory paths must be absolute." >&2
  exit 2
fi
[[ -x "$geth_binary" ]] || { echo "Core-Geth binary is not executable: $geth_binary" >&2; exit 2; }
[[ -f "$genesis" ]] || { echo "Disposable G2 genesis is missing: $genesis" >&2; exit 2; }
if [[ -e "$data_dir/geth/LOCK" ]]; then
  echo "Data directory is already locked: $data_dir" >&2
  exit 1
fi
mkdir -p "$data_dir"
if [[ ! -d "$data_dir/geth/chaindata" ]]; then
  "$geth_binary" --datadir "$data_dir" init "$genesis"
fi

echo "Starting isolated AIChain G2 KawPoW node on loopback RPC only."
exec "$geth_binary" \
  --datadir "$data_dir" \
  --aichain.kawpowdev \
  --networkid 20260824 \
  --nodiscover --maxpeers 0 \
  --mine --miner.threads 0 \
  --miner.etherbase 0x0000000000000000000000000000000000000001 \
  --http --http.addr 127.0.0.1 --http.port 8545 \
  --http.api eth,net,web3,aichain \
  --ipcpath "$data_dir/geth.ipc"
