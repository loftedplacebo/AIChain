#!/usr/bin/env bash
set -euo pipefail

# Starts a non-mining peer of the development network on the same VPS as node-1.
# It intentionally binds its RPC interface to localhost and does not modify
# firewall rules. NODE_1_LOCAL_ENODE must be the node-1 enode using 127.0.0.1.

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_binary="${NODE_BINARY:-$project_root/bin/core-geth}"
node_2_data_dir="${NODE_2_DATA_DIR:-$project_root/devnet/node-2}"
node_2_p2p_port="${NODE_2_P2P_PORT:-30304}"
node_2_rpc_port="${NODE_2_RPC_PORT:-8546}"
node_1_local_enode="${NODE_1_LOCAL_ENODE:-}"
log_path="${NODE_2_LOG_PATH:-$node_2_data_dir/node.log}"
pid_path="$node_2_data_dir/core-geth.pid"

if [[ ! -x "$node_binary" ]]; then
  echo "Core-Geth binary not found or not executable at $node_binary." >&2
  exit 1
fi
if [[ ! -e "$node_2_data_dir/geth" ]]; then
  echo "Node 2 is not initialized. Run scripts/initialize-devnet.sh $node_2_data_dir first." >&2
  exit 1
fi
if [[ -z "$node_1_local_enode" ]]; then
  echo "NODE_1_LOCAL_ENODE is required (use node 1's enode with host 127.0.0.1)." >&2
  exit 1
fi
if [[ -f "$pid_path" ]] && kill -0 "$(<"$pid_path")" 2>/dev/null; then
  echo "Node 2 is already running (PID $(<"$pid_path"))." >&2
  exit 1
fi

mkdir -p "$node_2_data_dir"
nohup env \
  DATA_DIR="$node_2_data_dir" \
  NODE_BINARY="$node_binary" \
  P2P_PORT="$node_2_p2p_port" \
  RPC_PORT="$node_2_rpc_port" \
  BOOTNODES="$node_1_local_enode" \
  "$project_root/scripts/start-devnet-node.sh" \
  >"$log_path" 2>&1 &
node_2_pid=$!
echo "$node_2_pid" > "$pid_path"
echo "Started non-mining node 2 (PID $node_2_pid). Log: $log_path"
echo "Add node 1 explicitly after its IPC is available:"
echo "  $node_binary attach --exec 'admin.addPeer(\"$node_1_local_enode\")' $node_2_data_dir/geth.ipc"
