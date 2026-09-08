#!/usr/bin/env bash
# Validate the non-secret closed-testnet release manifest before provisioning.
# This is deliberately a gate only: it starts no nodes and reads no secrets.
set -euo pipefail

manifest="${1:-config/closed-testnet.env}"
[[ -f "$manifest" ]] || { echo "Manifest not found: $manifest" >&2; exit 2; }

declare -A values=()
declare -A allowed=(
  [AICHAIN_TESTNET_NAME]=1 [AICHAIN_CHAIN_ID]=1 [AICHAIN_NETWORK_ID]=1
  [AICHAIN_GENESIS_SHA256]=1 [AICHAIN_CONSENSUS_PROFILE]=1
  [AICHAIN_MINER_OPERATORS]=1 [AICHAIN_VALIDATOR_OPERATORS]=1
  [AICHAIN_REGIONS]=1 [AICHAIN_PUBLIC_RPC]=1 [AICHAIN_RPC_BINDING]=1
  [AICHAIN_P2P_ALLOWLIST]=1 [AICHAIN_MONITORING]=1
  [AICHAIN_RESET_RUNBOOK_VERSION]=1
)

while IFS= read -r raw || [[ -n "$raw" ]]; do
  line="${raw%$'\r'}"
  [[ -z "$line" || "$line" == \#* ]] && continue
  [[ "$line" == *=* ]] || { echo "Malformed manifest line: $line" >&2; exit 2; }
  key="${line%%=*}"
  value="${line#*=}"
  [[ -n "${allowed[$key]:-}" ]] || { echo "Unsupported manifest key: $key" >&2; exit 2; }
  [[ -z "${values[$key]+x}" ]] || { echo "Duplicate manifest key: $key" >&2; exit 2; }
  [[ "$value" =~ ^[A-Za-z0-9.,:_-]+$ ]] || { echo "Unsafe or malformed value for $key" >&2; exit 2; }
  [[ "$value" != REPLACE_* ]] || { echo "Replace placeholder for $key" >&2; exit 2; }
  values[$key]="$value"
done < "$manifest"

for key in "${!allowed[@]}"; do
  [[ -n "${values[$key]:-}" ]] || { echo "Missing required key: $key" >&2; exit 2; }
done

[[ "${values[AICHAIN_CHAIN_ID]}" =~ ^[1-9][0-9]*$ ]] || { echo "AICHAIN_CHAIN_ID must be a positive integer" >&2; exit 2; }
[[ "${values[AICHAIN_NETWORK_ID]}" =~ ^[1-9][0-9]*$ ]] || { echo "AICHAIN_NETWORK_ID must be a positive integer" >&2; exit 2; }
[[ "${values[AICHAIN_CHAIN_ID]}" == "${values[AICHAIN_NETWORK_ID]}" ]] || { echo "Chain and network IDs must match for this release profile" >&2; exit 2; }
[[ "${values[AICHAIN_GENESIS_SHA256]}" =~ ^0x[0-9a-fA-F]{64}$ ]] || { echo "AICHAIN_GENESIS_SHA256 must be a 32-byte hex digest" >&2; exit 2; }
[[ "${values[AICHAIN_CONSENSUS_PROFILE]}" == "kawpow-candidate" ]] || { echo "Only the reviewed kawpow-candidate profile is accepted" >&2; exit 2; }
[[ "${values[AICHAIN_PUBLIC_RPC]}" == false ]] || { echo "Closed testnet must not expose public RPC" >&2; exit 2; }
[[ "${values[AICHAIN_RPC_BINDING]}" == private ]] || { echo "Closed testnet RPC binding must be private" >&2; exit 2; }
[[ "${values[AICHAIN_P2P_ALLOWLIST]}" == true ]] || { echo "Closed testnet requires P2P admission control" >&2; exit 2; }
[[ "${values[AICHAIN_MONITORING]}" == required ]] || { echo "Closed testnet monitoring is required" >&2; exit 2; }

count_csv() { awk -F, '{ print NF }' <<<"$1"; }
(( $(count_csv "${values[AICHAIN_MINER_OPERATORS]}") >= 3 )) || { echo "At least three miner operators are required" >&2; exit 2; }
(( $(count_csv "${values[AICHAIN_VALIDATOR_OPERATORS]}") >= 2 )) || { echo "At least two validator operators are required" >&2; exit 2; }
(( $(count_csv "${values[AICHAIN_REGIONS]}") >= 2 )) || { echo "At least two regions are required" >&2; exit 2; }

echo "Closed-testnet manifest passed pre-provisioning validation."
