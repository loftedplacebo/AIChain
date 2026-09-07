#!/usr/bin/env bash
# Disposable restart test for the Phase 3 development runner. This CPU-mined
# Ethash profile only exercises EVM/SDK recovery; it does not evaluate AIChain PoW.
set -euo pipefail
umask 077

cd "$(dirname "$0")/.."
: "${CORE_GETH_BIN:?Set the absolute path to a Core-Geth binary}"
[[ "$CORE_GETH_BIN" == /* ]] || { echo "CORE_GETH_BIN must be absolute" >&2; exit 2; }
command -v curl >/dev/null
command -v openssl >/dev/null
command -v python3 >/dev/null

template="$PWD/config/phase3-disposable-genesis.template.json"
[[ -f "$template" ]] || { echo "Phase 3 development genesis template is missing" >&2; exit 2; }
rpc_port="${AICHAIN_PHASE3_RPC_PORT:-18548}"
[[ "$rpc_port" =~ ^[0-9]{2,5}$ ]] && (( rpc_port >= 1024 && rpc_port <= 64535 )) || { echo "AICHAIN_PHASE3_RPC_PORT must be 1024–64535" >&2; exit 2; }
mkdir -p devnet
run=$(mktemp -d "$PWD/devnet/phase3-restart-XXXXXXXX")
node_pid=''
cleanup() { if [[ -n "$node_pid" ]]; then kill "$node_pid" 2>/dev/null || true; wait "$node_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT

password_file="$run/signer.password"
openssl rand -hex 32 >"$password_file"
"$CORE_GETH_BIN" --datadir "$run/node" account new --password "$password_file" >"$run/account.log" 2>&1
signer=$(basename "$(find "$run/node/keystore" -maxdepth 1 -type f | head -n 1)" | awk -F-- '{print $NF}')
[[ ${#signer} == 40 ]] || { echo "Could not derive disposable signer" >&2; exit 1; }

python3 - "$template" "$run/genesis.json" "$signer" <<'PY'
import json, sys
template, output, signer = sys.argv[1:]
with open(template, encoding="utf-8") as source:
    genesis = json.load(source)
address = signer.lower()
genesis["extraData"] = "0x" + "00" * 32 + address + "00" * 65
genesis["alloc"] = {address: {"balance": "0x3635c9adc5dea00000"}}
with open(output, "x", encoding="utf-8") as destination:
    json.dump(genesis, destination, indent=2)
    destination.write("\n")
PY
"$CORE_GETH_BIN" --datadir "$run/node" init "$run/genesis.json" >"$run/init.log" 2>&1

rpc() {
  curl --fail --silent --show-error --max-time 3 -X POST "http://127.0.0.1:$rpc_port" \
    -H 'content-type: application/json' --data "$1"
}
result() {
  rpc "$1" | python3 -c 'import json,sys; value=json.load(sys.stdin); assert "error" not in value, value; print(json.dumps(value["result"]))'
}
node_ready() {
  local response
  response=$(rpc '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' 2>/dev/null) || return 1
  [[ $(printf '%s' "$response" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("result", ""))') == '0x539' ]]
}
start_node() {
  "$CORE_GETH_BIN" --datadir "$run/node" --networkid 1337 --http --http.addr 127.0.0.1 --http.port "$rpc_port" --http.api eth,net,web3 --http.vhosts localhost --authrpc.port "$((rpc_port + 1000))" --nodiscover --maxpeers 0 --port 0 --allow-insecure-unlock --unlock "$signer" --password "$password_file" --mine --miner.threads 1 --miner.etherbase "0x$signer" >>"$run/node.log" 2>&1 &
  node_pid=$!
  for attempt in {1..60}; do
    kill -0 "$node_pid"
    if node_ready; then
      # Core-Geth opens HTTP before completing the requested keystore unlock.
      sleep 2
      return
    fi
    sleep 1
  done
  echo "Clique development node did not become ready" >&2
  exit 1
}
genesis_hash() {
  result '{"jsonrpc":"2.0","id":1,"method":"eth_getBlockByNumber","params":["0x0",false]}' | python3 -c 'import json,sys; print(json.load(sys.stdin)["hash"])'
}
block_number() {
  result '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' | python3 -c 'import json,sys; print(int(json.load(sys.stdin),16))'
}
send_self_transaction() {
  local request tx_hash receipt_response
  request=$(python3 - "0x$signer" <<'PY'
import json, sys
address = sys.argv[1]
print(json.dumps({"jsonrpc":"2.0","id":1,"method":"eth_sendTransaction","params":[{"from":address,"to":address,"value":"0x0"}]}))
PY
)
  tx_hash=$(result "$request" | python3 -c 'import json,sys; print(json.load(sys.stdin))')
  # The first CPU Ethash seal can require a one-time DAG build on a clean host.
  for attempt in {1..180}; do
    receipt_response=$(rpc "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_getTransactionReceipt\",\"params\":[\"$tx_hash\"]}" 2>/dev/null || true)
    if [[ -n "$receipt_response" ]] && printf '%s' "$receipt_response" | python3 -c 'import json,sys; value=json.load(sys.stdin); sys.exit(0 if value.get("result") else 1)'; then return; fi
    sleep 1
  done
  echo "Transaction was not sealed" >&2
  exit 1
}

start_node
before_genesis=$(genesis_hash)
before_block=$(block_number)
kill "$node_pid"
wait "$node_pid" || true
node_pid=''
start_node
after_genesis=$(genesis_hash)
[[ "$after_genesis" == "$before_genesis" ]] || { echo "Genesis changed after restart" >&2; exit 1; }
send_self_transaction
after_block=$(block_number)
(( after_block > before_block )) || { echo "No post-restart block was sealed" >&2; exit 1; }

python3 - "$run/restart-report.json" "$before_genesis" "$before_block" "$after_block" <<'PY'
import json, sys
output, genesis, before, after = sys.argv[1:]
with open(output, "x", encoding="utf-8") as destination:
    json.dump({"status":"passed", "profile":"disposable CPU-mined Ethash development chain; not AIChain production consensus", "genesisHash":genesis, "beforeBlock":int(before), "afterBlock":int(after)}, destination, indent=2)
    destination.write("\n")
print(output)
PY
