#!/usr/bin/env bash
# Regression checks for the closed-testnet pre-provisioning gate. No nodes,
# network connections or secrets are involved.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
validator="$repo_root/scripts/validate-closed-testnet-plan.sh"
fixture="$repo_root/fixtures/phase4/closed-testnet-manifest-valid.env"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

bash "$validator" "$fixture"

assert_rejected() {
  local name="$1" replacement="$2" file
  file="$tmp_dir/$name.env"
  sed "$replacement" "$fixture" > "$file"
  if bash "$validator" "$file" >/dev/null 2>&1; then
    echo "Expected manifest rejection: $name" >&2
    exit 1
  fi
}

assert_rejected duplicate-miner 's/miner-independent-c/miner-nvidia-a/'
assert_rejected overlap-role 's/validator-a,validator-b/miner-amd-b,validator-b/'
assert_rejected duplicate-region 's/region-one,region-two/region-one,region-one/'
assert_rejected zero-genesis 's/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/0x0000000000000000000000000000000000000000000000000000000000000000/'

echo "Closed-testnet manifest gate regression checks passed."
