#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 || $# -gt 4 ]]; then
  echo "Usage: $0 /absolute/path/to/kawpowminer /absolute/output/dir [block-number] [duration-seconds]" >&2
  exit 2
fi

miner_path="$1"
output_dir="$2"
block_number="${3:-42}"
duration_seconds="${4:-300}"

if [[ ! -x "$miner_path" ]]; then
  echo "Miner is not executable: $miner_path" >&2
  exit 2
fi
if [[ "$miner_path" != /* || "$output_dir" != /* ]]; then
  echo "Miner and output paths must be absolute." >&2
  exit 2
fi
if ! [[ "$block_number" =~ ^[0-9]+$ && "$duration_seconds" =~ ^[1-9][0-9]*$ ]]; then
  echo "Block number and duration must be positive decimal integers." >&2
  exit 2
fi

for command_name in nvidia-smi sha256sum timeout; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Required command is missing: $command_name" >&2
    exit 2
  fi
done

mkdir -p "$output_dir"
miner_log="$output_dir/miner.log"
telemetry_log="$output_dir/nvidia-telemetry.csv"
metadata_file="$output_dir/run-metadata.txt"

miner_sha256="$(sha256sum "$miner_path" | awk '{print $1}')"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

{
  echo "startedAtUtc=$started_at"
  echo "hostname=$(hostname)"
  echo "kernel=$(uname -a)"
  echo "minerPath=$miner_path"
  echo "minerSha256=$miner_sha256"
  echo "blockNumber=$block_number"
  echo "difficulty=1"
  echo "durationSeconds=$duration_seconds"
  nvidia-smi --query-gpu=name,uuid,driver_version,memory.total,power.limit --format=csv,noheader
} >"$metadata_file"

nvidia-smi \
  --query-gpu=timestamp,index,uuid,temperature.gpu,power.draw,power.limit,clocks.current.graphics,clocks.current.memory,memory.used,utilization.gpu \
  --format=csv,noheader,nounits \
  --loop=1 >"$telemetry_log" &
telemetry_pid=$!

cleanup() {
  if kill -0 "$telemetry_pid" 2>/dev/null; then
    kill "$telemetry_pid" 2>/dev/null || true
    wait "$telemetry_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

set +e
timeout --signal=INT --kill-after=15s "${duration_seconds}s" \
  "$miner_path" --cuda --benchmark "$block_number" --diff 1 >"$miner_log" 2>&1
miner_status=$?
set -e

finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
{
  echo "finishedAtUtc=$finished_at"
  echo "minerExitStatus=$miner_status"
} >>"$metadata_file"

# GNU timeout returns 124 when the bounded benchmark duration expires.
if [[ $miner_status -ne 0 && $miner_status -ne 124 && $miner_status -ne 130 ]]; then
  echo "Miner exited unexpectedly with status $miner_status. See $miner_log" >&2
  exit "$miner_status"
fi

echo "Offline KawPoW GPU control complete."
echo "Metadata:  $metadata_file"
echo "Miner log: $miner_log"
echo "Telemetry: $telemetry_log"
