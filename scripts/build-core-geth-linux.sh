#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_root="$project_root/node/core-geth"
output="${1:-$project_root/build/core-geth-g2}"

if [[ "$output" != /* ]]; then
  echo "Output path must be absolute." >&2
  exit 2
fi
for command_name in go gcc g++; do
  command -v "$command_name" >/dev/null 2>&1 || { echo "Missing required command: $command_name" >&2; exit 2; }
done
[[ -f "$node_root/go.mod" ]] || { echo "Core-Geth submodule is missing." >&2; exit 2; }

mkdir -p "$(dirname "$output")" "$project_root/.gocache" "$project_root/.gomodcache"
cd "$node_root"
CGO_ENABLED=1 GOCACHE="$project_root/.gocache" GOMODCACHE="$project_root/.gomodcache" \
  go build -buildvcs=false -trimpath -o "$output" ./cmd/geth
"$output" version
