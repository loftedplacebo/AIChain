#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
geth_binary="${1:?Usage: $0 /absolute/core-geth /absolute/run-directory 5|10|15}"
run_dir="${2:?Missing run directory}"
target="${3:?Missing target seconds (5, 10 or 15)}"
base_genesis="$project_root/config/kawpow-asert-disposable-genesis.json"

[[ "$target" == 5 || "$target" == 10 || "$target" == 15 ]] || { echo "Target must be 5, 10 or 15 seconds." >&2; exit 2; }
[[ "$geth_binary" == /* && "$run_dir" == /* ]] || { echo "Binary and run directory paths must be absolute." >&2; exit 2; }
[[ -x "$geth_binary" ]] || { echo "Core-Geth binary is not executable: $geth_binary" >&2; exit 2; }
[[ -f "$base_genesis" ]] || { echo "ASERT base genesis is missing: $base_genesis" >&2; exit 2; }
[[ ! -e "$run_dir" ]] || { echo "Refusing to reuse disposable run directory: $run_dir" >&2; exit 2; }

install -d -m 700 "$run_dir" "$run_dir/miner" "$run_dir/evidence"
password_file="$run_dir/account-password"
openssl rand -hex 32 > "$password_file"
chmod 600 "$password_file"
account_output="$($geth_binary --datadir "$run_dir/miner" account new --password "$password_file")"
address="$(sed -n 's/^Public address of the key: *//p' <<<"$account_output" | tail -1)"
[[ "$address" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "Could not parse generated ASERT account." >&2; exit 1; }

python3 - "$base_genesis" "$run_dir/genesis.json" "$address" "$target" <<'PY'
import json, sys, time
source, destination, address, target_text = sys.argv[1:]
target = int(target_text)
network_id = 2_026_082_700 + target
difficulties = {5: 0x28000, 10: 0x50000, 15: 0x78000}
with open(source, encoding="utf-8") as handle:
    genesis = json.load(handle)
genesis["config"]["networkId"] = network_id
genesis["config"]["chainId"] = network_id
genesis["timestamp"] = hex(int(time.time()) - target)
genesis["difficulty"] = hex(difficulties[target])
genesis["extraData"] = "0x" + f"AIChain ASERT v1 {target}s disposable".encode().hex()
genesis["alloc"] = {address[2:].lower(): {"balance": "0x3635c9adc5dea00000"}}
with open(destination, "x", encoding="utf-8") as handle:
    json.dump(genesis, handle, indent=2)
    handle.write("\n")
PY

cat > "$run_dir/public-run.env" <<EOF
ASERT_TARGET_SECONDS=$target
ASERT_NETWORK_ID=$((2026082700 + target))
ASERT_ACCOUNT_ADDRESS=$address
ASERT_GENESIS=$run_dir/genesis.json
ASERT_MINER_DATADIR=$run_dir/miner
ASERT_PASSWORD_FILE=$password_file
EOF
chmod 600 "$run_dir/public-run.env"
printf '%s\n' "$address"
