#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: run-zk-proof-benchmark.sh <risc0|sp1> <output-report.json> [warmups] [measurements]

Runs a single candidate sequentially on one host. Each run creates an ignored
proof export under artifacts/zk/ and emits only bounded metadata to the report.
The default is five warm-ups followed by ten measured proofs.

Required tools: bash, cargo, jq, /usr/bin/time, and the candidate's pinned
toolchain. Run from the repository root or set AICHAIN_REPO_ROOT.
EOF
}

if [[ $# -lt 2 || $# -gt 4 ]]; then
  usage >&2
  exit 2
fi

candidate=$1
report_path=$2
warmups=${3:-5}
measurements=${4:-10}

if ! [[ $warmups =~ ^[0-9]+$ && $measurements =~ ^[1-9][0-9]*$ ]]; then
  echo "warmups must be zero or greater and measurements must be one or greater" >&2
  exit 2
fi

repo_root=${AICHAIN_REPO_ROOT:-$(git rev-parse --show-toplevel)}
fixture="$repo_root/fixtures/zk/policy-evaluation-v0.1.0-draft.json"
artifact_dir="$repo_root/artifacts/zk/benchmark-$candidate"
run_dir=$(mktemp -d "${TMPDIR:-/tmp}/aichain-zk-benchmark-$candidate.XXXXXX")
mkdir -p "$artifact_dir" "$(dirname "$report_path")"
export PATH="${AICHAIN_CARGO_BIN_DIR:-$HOME/.cargo/bin}:$PATH"

cleanup() {
  rm -rf "$run_dir"
}
trap cleanup EXIT

case "$candidate" in
  risc0)
    workdir="$repo_root/spikes/zk-statement/risc0-policy-evaluation"
    stack_version="3.0.3"
    export PATH="${RISC0_BIN_DIR:-$HOME/.risc0/bin}:$PATH"
    command=(env RISC0_DEV_MODE=0 RISC0_PROVER=ipc cargo run --release -p aichain-risc0-policy-evaluation-host -- --evm-export "$fixture")
    ;;
  sp1)
    workdir="$repo_root/spikes/zk-statement/sp1-policy-evaluation"
    stack_version="6.5.0"
    export PATH="${SP1_BIN_DIR:-$HOME/.sp1/bin}:$PATH"
    command=(cargo run --release -p aichain-sp1-policy-evaluation-script -- --evm-export "$fixture")
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

run_one() {
  local phase=$1
  local ordinal=$2
  local artifact="$artifact_dir/$phase-$ordinal.json"
  local timing="$run_dir/$phase-$ordinal.time"
  local log="$run_dir/$phase-$ordinal.log"

  echo "[$candidate] $phase $ordinal"
  (
    cd "$workdir"
    /usr/bin/time -v -o "$timing" "${command[@]}" "$artifact" >"$log" 2>&1
  )

  jq -e . "$artifact" >/dev/null
  local wall_seconds max_rss_kib cpu_percent
  wall_seconds=$(awk -F': ' '/Elapsed \(wall clock\)/ { split($2, parts, ":"); if (length(parts) == 3) print parts[1] * 3600 + parts[2] * 60 + parts[3]; else print parts[1] * 60 + parts[2] }' "$timing")
  max_rss_kib=$(awk -F': ' '/Maximum resident set size/ { print $2 }' "$timing")
  cpu_percent=$(awk -F': ' '/Percent of CPU this job got/ { gsub(/%/, "", $2); print $2 }' "$timing")

  jq \
    --arg phase "$phase" \
    --argjson ordinal "$ordinal" \
    --argjson wallSeconds "$wall_seconds" \
    --argjson maxRssKiB "$max_rss_kib" \
    --argjson cpuPercent "$cpu_percent" \
    '{
      phase: $phase,
      ordinal: $ordinal,
      proofElapsedMs: .provingElapsedMs,
      proofBytes: (.proofBytes // .sealBytes),
      publicValuesBytes: (.publicValuesBytes // .journalBytes),
      receiptId: .receiptId,
      wallSeconds: $wallSeconds,
      maxRssKiB: $maxRssKiB,
      cpuPercent: $cpuPercent
    }' "$artifact" >"$run_dir/$phase-$ordinal.json"
}

for ((index = 1; index <= warmups; index++)); do
  run_one warmup "$index"
done

for ((index = 1; index <= measurements; index++)); do
  run_one measurement "$index"
done

jq -s \
  --arg candidate "$candidate" \
  --arg stackVersion "$stack_version" \
  --arg generatedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --arg fixture "fixtures/zk/policy-evaluation-v0.1.0-draft.json" \
  --argjson warmups "$warmups" \
  --argjson measurements "$measurements" \
  '
  def percentile($field; $percentile):
    sort_by(.[$field]) as $sorted
    | ($sorted | length) as $count
    | $sorted[(((($count * $percentile) | ceil) - 1) | if . < 0 then 0 else . end)][$field];
  . as $runs
  | map(select(.phase == "measurement")) as $measured
  | {
      schemaVersion: "aichain.zk.proof-benchmark.v1",
      generatedAt: $generatedAt,
      candidate: $candidate,
      stackVersion: $stackVersion,
      fixture: $fixture,
      warmupCount: $warmups,
      measurementCount: $measurements,
      warmups: map(select(.phase == "warmup")),
      measurements: $measured,
      summary: {
        proofElapsedMs: {
          min: ($measured | min_by(.proofElapsedMs).proofElapsedMs),
          median: percentile("proofElapsedMs"; 0.5),
          p95: percentile("proofElapsedMs"; 0.95),
          max: ($measured | max_by(.proofElapsedMs).proofElapsedMs)
        },
        wallSeconds: {
          min: ($measured | min_by(.wallSeconds).wallSeconds),
          median: percentile("wallSeconds"; 0.5),
          p95: percentile("wallSeconds"; 0.95),
          max: ($measured | max_by(.wallSeconds).wallSeconds)
        },
        maxRssKiB: {
          min: ($measured | min_by(.maxRssKiB).maxRssKiB),
          median: percentile("maxRssKiB"; 0.5),
          p95: percentile("maxRssKiB"; 0.95),
          max: ($measured | max_by(.maxRssKiB).maxRssKiB)
        },
        proofBytes: ($measured | map(.proofBytes) | unique),
        publicValuesBytes: ($measured | map(.publicValuesBytes) | unique),
        receiptIds: ($measured | map(.receiptId) | unique)
      }
    }
  ' "$run_dir"/*.json >"$report_path"

echo "Benchmark report written to: $report_path"
