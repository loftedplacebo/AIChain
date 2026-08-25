#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
geth_binary="${1:?Usage: $0 /absolute/core-geth /absolute/run-directory}"
run_dir="${2:?Usage: $0 /absolute/core-geth /absolute/run-directory}"
base_genesis="$project_root/config/kawpow-g3-disposable-genesis.json"

if [[ "$geth_binary" != /* || "$run_dir" != /* ]]; then
  echo "Binary and run directory paths must be absolute." >&2
  exit 2
fi
[[ -x "$geth_binary" ]] || { echo "Core-Geth binary is not executable: $geth_binary" >&2; exit 2; }
[[ -f "$base_genesis" ]] || { echo "G3 base genesis is missing: $base_genesis" >&2; exit 2; }
[[ ! -e "$run_dir" ]] || { echo "Refusing to reuse G3 run directory: $run_dir" >&2; exit 2; }

install -d -m 700 "$run_dir" "$run_dir/miner" "$run_dir/evidence"
password_file="$run_dir/account-password"
openssl rand -hex 32 > "$password_file"
chmod 600 "$password_file"

account_output="$($geth_binary --datadir "$run_dir/miner" account new --password "$password_file")"
address="$(sed -n 's/^Public address of the key: *//p' <<<"$account_output" | tail -1)"
[[ "$address" =~ ^0x[0-9a-fA-F]{40}$ ]] || { echo "Could not parse generated G3 account." >&2; exit 1; }

python3 - "$base_genesis" "$run_dir/genesis.json" "$address" <<'PY'
import json
import sys

source, target, address = sys.argv[1:]
with open(source, encoding="utf-8") as handle:
    genesis = json.load(handle)
genesis["alloc"] = {address[2:].lower(): {"balance": "0x3635c9adc5dea00000"}}
with open(target, "x", encoding="utf-8") as handle:
    json.dump(genesis, handle, indent=2)
    handle.write("\n")
PY

cat > "$run_dir/public-run.env" <<EOF
G3_ACCOUNT_ADDRESS=$address
G3_GENESIS=$run_dir/genesis.json
G3_MINER_DATADIR=$run_dir/miner
G3_PASSWORD_FILE=$password_file
EOF
chmod 600 "$run_dir/public-run.env"
printf '%s\n' "$address"

