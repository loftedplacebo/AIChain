#!/usr/bin/env bash
set -euo pipefail

geth_binary="${1:?Usage: $0 /absolute/core-geth /absolute/datadir mining|validator rpc-port p2p-port genesis.json}"
data_dir="${2:?Missing data directory}"
role="${3:?Missing node role}"
rpc_port="${4:?Missing RPC port}"
p2p_port="${5:?Missing P2P port}"
genesis="${6:?Missing genesis path}"

if [[ "$geth_binary" != /* || "$data_dir" != /* || "$genesis" != /* ]]; then
  echo "Binary, data directory and genesis paths must be absolute." >&2
  exit 2
fi
[[ "$role" == mining || "$role" == validator ]] || { echo "Role must be mining or validator." >&2; exit 2; }
[[ -x "$geth_binary" ]] || { echo "Core-Geth binary is not executable: $geth_binary" >&2; exit 2; }
[[ -f "$genesis" ]] || { echo "Genesis is missing: $genesis" >&2; exit 2; }
# Core-Geth keeps the LOCK path after a clean shutdown and performs the real
# process-level lock check itself when opening the database.
mkdir -p "$data_dir"
if [[ ! -d "$data_dir/geth/chaindata" ]]; then
  "$geth_binary" --datadir "$data_dir" init "$genesis"
fi

http_apis="eth,net,web3"
declare -a role_args=()
if [[ "$role" == mining ]]; then
  etherbase="${G3_ETHERBASE:?Set G3_ETHERBASE for the mining node.}"
  http_apis="$http_apis,aichain"
  role_args=(--mine --miner.threads 0 --miner.etherbase "$etherbase")
fi

echo "Starting isolated AIChain G3 $role node: RPC 127.0.0.1:$rpc_port, P2P 127.0.0.1:$p2p_port"
exec "$geth_binary" \
  --datadir "$data_dir" \
  --aichain.kawpowdev \
  --networkid 20260825 \
  --syncmode full \
  --nodiscover --maxpeers 4 --nat none --port "$p2p_port" \
  --http --http.addr 127.0.0.1 --http.port "$rpc_port" \
  --http.api "$http_apis" --http.vhosts localhost \
  --authrpc.addr 127.0.0.1 --authrpc.port "$((rpc_port + 1000))" \
  "${role_args[@]}"
