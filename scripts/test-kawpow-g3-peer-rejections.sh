#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_root="$project_root/node/core-geth"
[[ -f "$node_root/go.mod" ]] || { echo "Core-Geth submodule is missing." >&2; exit 2; }

cd "$node_root"
CGO_ENABLED=1 go test -count=1 -run \
  'TestNewBlockExceedsLimits|TestNewBlockUndecodableBody|TestNewBlockInvalidBodyKeepsPeer|TestNewBlockSanityCheck' \
  ./eth/protocols/eth
CGO_ENABLED=1 go test -count=1 -run \
  'TestVerifySealRejectsMalformedCandidateInputs|TestVerifySealAcceptsValidAndRejectsTampering|TestVerifyHeaderHonoursSealFlag|TestVerifyHeadersPreservesResultOrder|TestVerifyHeadersDelegatesContinuousStructuralBatch' \
  ./consensus/kawpowengine
