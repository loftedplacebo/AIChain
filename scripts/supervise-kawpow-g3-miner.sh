#!/usr/bin/env bash
set -euo pipefail

miner="${1:?Usage: $0 /absolute/kawpowminer /absolute/core-geth /absolute/geth.ipc /absolute/output-dir [adapter-url]}"
geth="${2:?Missing Core-Geth binary}"
ipc="${3:?Missing node IPC path}"
output_dir="${4:?Missing output directory}"
adapter_url="${5:-http://127.0.0.1:18545}"
work_status_file="${AICHAIN_WORK_STATUS_FILE:-$output_dir/current-work.json}"
work_refresh_margin="${AICHAIN_WORK_REFRESH_MARGIN_SECONDS:-5}"
max_job_seconds="${AICHAIN_MAX_JOB_SECONDS:-45}"
max_gpu_temp="${AICHAIN_MAX_GPU_TEMP_C:-80}"

for path in "$miner" "$geth"; do
  [[ "$path" == /* && -x "$path" ]] || { echo "Executable must be an absolute path: $path" >&2; exit 2; }
done
[[ "$ipc" == /* && "$output_dir" == /* ]] || { echo "IPC and output paths must be absolute." >&2; exit 2; }
[[ "$adapter_url" == http://127.0.0.1:* || "$adapter_url" == http://localhost:* ]] || {
  echo "Adapter URL must be loopback-only." >&2
  exit 2
}
[[ "$work_status_file" == /* ]] || { echo "AICHAIN_WORK_STATUS_FILE must be absolute." >&2; exit 2; }
[[ "$work_refresh_margin" =~ ^[0-9]+$ && "$max_job_seconds" =~ ^[1-9][0-9]*$ && "$max_gpu_temp" =~ ^[0-9]+$ ]] || {
  echo "Refresh margin and maximum GPU temperature must be non-negative integers." >&2; exit 2;
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
  miner_started_at="$(date +%s)"
  printf '{"timestamp":%s,"event":"miner-start","height":%s,"pid":%s}\n' \
    "$(date +%s)" "$last_height" "$miner_pid" >>"$events"
}

work_expired_or_near_expiry() {
  [[ -f "$work_status_file" ]] || return 1
  python3 - "$work_status_file" "$work_refresh_margin" <<'PY'
import json, sys, time
try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
    expires = int(payload["expiresAt"])
    raise SystemExit(0 if time.time() >= expires - int(sys.argv[2]) else 1)
except Exception:
    raise SystemExit(1)
PY
}

gpu_too_hot() {
  (( max_gpu_temp == 0 )) && return 1
  command -v nvidia-smi >/dev/null 2>&1 || return 1
  local temperature
  temperature="$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null | head -n1 | tr -d ' ')"
  [[ "$temperature" =~ ^[0-9]+$ ]] && (( temperature >= max_gpu_temp ))
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
  elif work_expired_or_near_expiry; then
    printf '{"timestamp":%s,"event":"work-refresh","height":%s}\n' \
      "$(date +%s)" "$current_height" >>"$events"
    stop_miner
    start_miner
  elif (( $(date +%s) - miner_started_at >= max_job_seconds )); then
    # Legacy pool miners can retain an expired template indefinitely. A bounded
    # restart forces eth_getWork even if the adapter status file is unavailable.
    printf '{"timestamp":%s,"event":"max-job-refresh","height":%s,"maxJobSeconds":%s}\n' \
      "$(date +%s)" "$current_height" "$max_job_seconds" >>"$events"
    stop_miner
    start_miner
  elif gpu_too_hot; then
    printf '{"timestamp":%s,"event":"thermal-pause","height":%s,"maxGpuTempC":%s}\n' \
      "$(date +%s)" "$current_height" "$max_gpu_temp" >>"$events"
    stop_miner
    sleep 30
    start_miner
  elif ! kill -0 "$miner_pid" 2>/dev/null; then
    wait "$miner_pid" 2>/dev/null || true
    printf '{"timestamp":%s,"event":"miner-restart-after-exit","height":%s}\n' \
      "$(date +%s)" "$current_height" >>"$events"
    start_miner
  fi
done
