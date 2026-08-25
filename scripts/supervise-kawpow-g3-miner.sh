#!/usr/bin/env bash
set -euo pipefail

miner="${1:?Usage: $0 /absolute/kawpowminer /absolute/core-geth /absolute/geth.ipc /absolute/output-dir [adapter-url]}"
geth="${2:?Missing Core-Geth binary}"
ipc="${3:?Missing node IPC path}"
output_dir="${4:?Missing output directory}"
adapter_url="${5:-http://127.0.0.1:18545}"

for path in "$miner" "$geth"; do
  [[ "$path" == /* && -x "$path" ]] || { echo "Executable must be an absolute path: $path" >&2; exit 2; }
done
[[ "$ipc" == /* && "$output_dir" == /* ]] || { echo "IPC and output paths must be absolute." >&2; exit 2; }
[[ "$adapter_url" == http://127.0.0.1:* || "$adapter_url" == http://localhost:* ]] || {
  echo "Adapter URL must be loopback-only." >&2
  exit 2
}

mkdir -p "$output_dir"
miner_log="$output_dir/gpu-miner-supervised.log"
events="$output_dir/gpu-miner-supervisor-events.jsonl"
miner_pid=""

stop_miner() {
  if [[ -n "$miner_pid" ]] && kill -0 "$miner_pid" 2>/dev/null; then
    kill "$miner_pid" 2>/dev/null || true
    for _ in {1..20}; do
      kill -0 "$miner_pid" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "$miner_pid" 2>/dev/null; then
      kill -KILL "$miner_pid" 2>/dev/null || true
    fi
    wait "$miner_pid" 2>/dev/null || true
  fi
}
trap stop_miner EXIT
trap 'exit 0' INT TERM

height() {
  "$geth" attach --exec eth.blockNumber "$ipc" 2>/dev/null | tail -1
}

start_miner() {
  "$miner" --cuda -P "$adapter_url" >>"$miner_log" 2>&1 &
  miner_pid=$!
  printf '{"timestamp":%s,"event":"miner-start","height":%s,"pid":%s}\n' \
    "$(date +%s)" "$last_height" "$miner_pid" >>"$events"
}

last_height="$(height)"
[[ "$last_height" =~ ^[0-9]+$ ]] || { echo "Could not read canonical node height." >&2; exit 1; }
start_miner

while sleep 0.25; do
  current_height="$(height)"
  [[ "$current_height" =~ ^[0-9]+$ ]] || continue
  if (( current_height > last_height )); then
    printf '{"timestamp":%s,"event":"height-advanced","from":%s,"to":%s}\n' \
      "$(date +%s)" "$last_height" "$current_height" >>"$events"
    stop_miner
    last_height="$current_height"
    start_miner
  elif ! kill -0 "$miner_pid" 2>/dev/null; then
    wait "$miner_pid" 2>/dev/null || true
    printf '{"timestamp":%s,"event":"miner-restart-after-exit","height":%s}\n' \
      "$(date +%s)" "$current_height" >>"$events"
    start_miner
  fi
done
