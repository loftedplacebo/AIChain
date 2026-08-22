#!/usr/bin/env bash
# Read-only health check for the private VPS development network.

set -euo pipefail

node_binary="${NODE_BINARY:-/opt/aichain/bin/core-geth}"
node_1_data_dir="${NODE_1_DATA_DIR:-/opt/aichain/devnet/node-1}"
node_2_data_dir="${NODE_2_DATA_DIR:-/opt/aichain/devnet/node-2}"
node_1_min_peers="${NODE_1_MIN_PEERS:-1}"
node_2_min_peers="${NODE_2_MIN_PEERS:-1}"

if [[ ! -x "$node_binary" ]]; then
  echo "Core-Geth binary not found: $node_binary" >&2
  exit 1
fi

query() {
  "$node_binary" attach --exec "$1" "$2/geth.ipc" | tr -d '"'
}

node_1_block="$(query 'eth.blockNumber' "$node_1_data_dir")"
node_2_block="$(query 'eth.blockNumber' "$node_2_data_dir")"
node_1_syncing="$(query 'eth.syncing' "$node_1_data_dir")"
node_2_syncing="$(query 'eth.syncing' "$node_2_data_dir")"
node_1_peers="$(query 'admin.peers.length' "$node_1_data_dir")"
node_2_peers="$(query 'admin.peers.length' "$node_2_data_dir")"
node_1_chain_id="$(query 'eth.chainId' "$node_1_data_dir")"
node_2_chain_id="$(query 'eth.chainId' "$node_2_data_dir")"

if [[ "$node_1_block" != "$node_2_block" ]]; then
  echo "Node block heights differ: node-1=$node_1_block node-2=$node_2_block" >&2
  exit 1
fi
if [[ "$node_1_syncing" != "false" || "$node_2_syncing" != "false" ]]; then
  echo "A VPS node is still syncing: node-1=$node_1_syncing node-2=$node_2_syncing" >&2
  exit 1
fi
if [[ "$node_1_chain_id" != "$node_2_chain_id" ]]; then
  echo "Node chain IDs differ: node-1=$node_1_chain_id node-2=$node_2_chain_id" >&2
  exit 1
fi
if (( node_1_peers < node_1_min_peers || node_2_peers < node_2_min_peers )); then
  echo "Peer count below expected minimum: node-1=$node_1_peers node-2=$node_2_peers" >&2
  exit 1
fi

printf 'VPS devnet healthy: chainId=%s block=%s node1Peers=%s node2Peers=%s\n' \
  "$node_1_chain_id" "$node_1_block" "$node_1_peers" "$node_2_peers"
