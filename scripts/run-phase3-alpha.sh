#!/usr/bin/env bash
# Isolated Linux profile. Does not use or modify the operational devnet.
set -euo pipefail
umask 077
cd "$(dirname "$0")/.."
: "${CORE_GETH_BIN:?Set the path to a built Core-Geth binary}"
: "${RISC0_ETHEREUM_DIR:?Set the pinned risc0-ethereum v3.0.0 checkout}"
: "${RISC0_HOST_BIN:?Set the built policy-evaluation host binary}"
for tool in node forge python3 timeout; do command -v "$tool" >/dev/null; done
node -e 'if(Number(process.versions.node.split(".")[0])<24)process.exit(1)'
test "$(git -C "$RISC0_ETHEREUM_DIR" rev-parse HEAD)" = 32aa0b6f23ddd02dd93fc71717667606e5c7db86
CORE_GETH_BIN=$(realpath "$CORE_GETH_BIN")
RISC0_HOST_BIN=$(realpath "$RISC0_HOST_BIN")
RISC0_ETHEREUM_DIR=$(realpath "$RISC0_ETHEREUM_DIR")
genesis_template=$(realpath config/phase3-disposable-genesis.template.json)
rpc_port="${AICHAIN_PHASE3_RPC_PORT:-18548}"
[[ "$rpc_port" =~ ^[0-9]{2,5}$ ]] && (( rpc_port >= 1024 && rpc_port <= 64535 )) || { echo "AICHAIN_PHASE3_RPC_PORT must be 1024–64535" >&2; exit 2; }
mkdir -p devnet
run=$(mktemp -d "$PWD/devnet/phase3-XXXXXXXX")
node_pid=''
cleanup() { if [[ -n "$node_pid" ]]; then kill "$node_pid" 2>/dev/null || true; wait "$node_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
# Fail if the fixed integration port is already occupied. Never attach a live node.
RPC_PORT="$rpc_port" node -e 'const s=require("net").createServer();s.once("error",()=>process.exit(1));s.listen(Number(process.env.RPC_PORT),"127.0.0.1",()=>s.close())'
password_file="$run/signer.password"
openssl rand -hex 32 >"$password_file"
"$CORE_GETH_BIN" --datadir "$run/node" account new --password "$password_file" >"$run/account.log" 2>&1
signer=$(basename "$(find "$run/node/keystore" -maxdepth 1 -type f | head -n 1)" | awk -F-- '{print $NF}')
test "${#signer}" = 40
python3 - "$genesis_template" "$run/genesis.json" "$signer" <<'PY'
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
start_node() {
  "$CORE_GETH_BIN" --datadir "$run/node" --networkid 1337 --http --http.addr 127.0.0.1 --http.port "$rpc_port" --http.api eth,net,web3 --http.vhosts localhost --authrpc.port "$((rpc_port + 1000))" --nodiscover --maxpeers 0 --port 0 --allow-insecure-unlock --unlock "$signer" --password "$password_file" --mine --miner.threads 1 --miner.etherbase "0x$signer" >"$run/node.log" 2>&1 &
  node_pid=$!
  ready=0
  for attempt in {1..60}; do
    kill -0 "$node_pid"
    if RPC_PORT="$rpc_port" node -e 'fetch(`http://127.0.0.1:${process.env.RPC_PORT}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method:"eth_chainId",params:[]})}).then(r=>r.json()).then(r=>{if(r.result!=="0x539")process.exit(1)}).catch(()=>process.exit(1))'; then sleep 2; ready=1; break; fi
    sleep 1
  done
  test "$ready" = 1
}
start_node
mkdir "$run/artifacts"
forge build --root contracts/avr-anchor --out "$run/contracts-out" --cache-path "$run/contracts-cache"
forge build --root "$RISC0_ETHEREUM_DIR/contracts" --evm-version istanbul --out "$run/risc0-out" --cache-path "$run/risc0-cache"
for name in AuthorityRegistry AuthorisedAVRAnchor ReceiptBatchAnchor RiscZeroAVRProofVerifierAdapter; do
  cp "$run/contracts-out/$name.sol/$name.json" "$run/artifacts/"
done
cp "$run/risc0-out/RiscZeroGroth16Verifier.sol/RiscZeroGroth16Verifier.json" "$run/artifacts/"
export AICHAIN_ENABLE_PHASE3=1
export AICHAIN_PHASE3_RPC_URL="http://127.0.0.1:$rpc_port"
timeout 120 node scripts/phase3-alpha.js prepare "$run"
RISC0_DEV_MODE=0 RISC0_PROVER=ipc timeout 1800 "$RISC0_HOST_BIN" --evm-export "$run/witness.json" "$run/proof.json"
cp fixtures/zk/phase3-image-id.txt "$run/image-id.txt"
timeout 180 node scripts/phase3-alpha.js verify "$run"
python3 scripts/phase3-python-check.py "$run"
timeout 180 node scripts/phase3-load.js "$run"
kill "$node_pid"
wait "$node_pid" || true
node_pid=''
start_node
timeout 120 node scripts/phase3-alpha.js restart "$run"
echo "Evidence retained in $run; disposable node stops on exit. context.json contains a disposable key."
