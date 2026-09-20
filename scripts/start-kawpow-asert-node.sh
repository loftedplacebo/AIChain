#!/usr/bin/env bash
set -euo pipefail

geth_binary="${1:?Usage: $0 /absolute/core-geth /absolute/datadir mining|validator rpc-port p2p-port genesis.json 5|10|15}"
data_dir="${2:?Missing data directory}"
role="${3:?Missing node role}"
rpc_port="${4:?Missing RPC port}"
p2p_port="${5:?Missing P2P port}"
genesis="${6:?Missing genesis path}"
target="${7:?Missing ASERT target seconds}"

[[ "$geth_binary" == /* && "$data_dir" == /* && "$genesis" == /* ]] || { echo "Binary, data directory and genesis paths must be absolute." >&2; exit 2; }
[[ "$role" == mining || "$role" == validator ]] || { echo "Role must be mining or validator." >&2; exit 2; }
[[ "$target" == 5 || "$target" == 10 || "$target" == 15 ]] || { echo "Target must be 5, 10 or 15 seconds." >&2; exit 2; }
[[ -x "$geth_binary" ]] || { echo "Core-Geth binary is not executable: $geth_binary" >&2; exit 2; }
[[ -f "$genesis" ]] || { echo "Genesis is missing: $genesis" >&2; exit 2; }

mkdir -p "$data_dir"
if [[ ! -d "$data_dir/geth/chaindata" ]]; then
  "$geth_binary" --datadir "$data_dir" init "$genesis"
fi

# Core-Geth configures the P2P bind host through the Node.P2P TOML section
# (rather than a --listenaddr CLI flag).  Keep disposable-node P2P private:
# remote peers must arrive through an explicitly configured loopback relay.
p2p_config="$data_dir/aichain-private-p2p.toml"
cat > "$p2p_config" <<EOF
[Node.P2P]
ListenAddr = "127.0.0.1:$p2p_port"
NoDiscovery = true
MaxPeers = 8
EOF
chmod 600 "$p2p_config"

http_apis="eth,net,web3"
declare -a role_args=()
if [[ "$role" == mining ]]; then
  etherbase="${ASERT_ETHERBASE:?Set ASERT_ETHERBASE for the mining node.}"
  http_apis="$http_apis,aichain"
  role_args=(--mine --miner.threads 0 --miner.etherbase "$etherbase")
fi

network_id=$((2026082700 + target))
echo "Starting isolated AIChain ASERT-v1 ${target}s $role node: RPC 127.0.0.1:$rpc_port, P2P 127.0.0.1:$p2p_port"
exec "$geth_binary" \
  --config "$p2p_config" \
  --datadir "$data_dir" \
  --aichain.kawpowdev \
  --aichain.kawpowdev.asert-target "$target" \
  --networkid "$network_id" \
  --nodiscover --maxpeers 8 --nat none \
  --http --http.addr 127.0.0.1 --http.port "$rpc_port" \
  --http.api "$http_apis" --http.vhosts localhost \
  --authrpc.addr 127.0.0.1 --authrpc.port "$((rpc_port + 1000))" \
  "${role_args[@]}"
