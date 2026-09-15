#!/usr/bin/env bash
# Reproducible Linux test entrypoint for the Core-Geth KawPoW development boundary.
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
core_geth="${AICHAIN_CORE_GETH_DIR:-$project_root/node/core-geth}"
go_bin="${AICHAIN_GO_BIN:-go}"
command -v "$go_bin" >/dev/null 2>&1 || { echo "Go toolchain not found: $go_bin" >&2; exit 2; }
[[ -f "$core_geth/go.mod" ]] || { echo "Core-Geth checkout not found: $core_geth" >&2; exit 2; }

version="$($go_bin version)"
echo "Using $version"
cd "$core_geth"
"$go_bin" test ./consensus/kawpow
"$go_bin" test ./consensus/kawpowengine
"$go_bin" test -race ./consensus/kawpowengine
