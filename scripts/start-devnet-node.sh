#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="${DATA_DIR:-$project_root/devnet/node-1}"
node_binary="${NODE_BINARY:-$project_root/bin/core-geth}"
network_id="${NETWORK_ID:-20260818}"
p2p_port="${P2P_PORT:-30303}"
rpc_port="${RPC_PORT:-8545}"
authrpc_port="${AUTHRPC_PORT:-8551}"
bootnodes="${BOOTNODES:-}"
miner_etherbase="${MINER_ETHERBASE:-}"
miner_threads="${MINER_THREADS:-1}"

if [[ ! -x "$node_binary" ]]; then
  echo "Core-Geth binary not found or not executable at $node_binary." >&2
  exit 1
fi
if [[ ! -e "$data_dir/geth" ]]; then
  echo "No initialized chain database found at $data_dir. Run scripts/initialize-devnet.sh first." >&2
  exit 1
fi

arguments=(
  --datadir "$data_dir"
  --networkid "$network_id"
  --port "$p2p_port"
  --nat none
  --ethash.dagdir "$data_dir/ethash-dag"
  --http
  --http.addr 127.0.0.1
  --http.port "$rpc_port"
  --http.api eth,net,web3,txpool
  --http.vhosts localhost
  --authrpc.addr 127.0.0.1
  --authrpc.port "$authrpc_port"
  --nodiscover
)
if [[ -n "$bootnodes" ]]; then arguments+=(--bootnodes "$bootnodes"); fi
if [[ -n "$miner_etherbase" ]]; then arguments+=(--mine --miner.etherbase "$miner_etherbase" --miner.threads "$miner_threads"); fi

echo "Starting a development-only node. HTTP JSON-RPC is bound to localhost."
exec "$node_binary" "${arguments[@]}"
