#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) -eq 0 ]] || { echo 'Run as root' >&2; exit 2; }
base=/opt/aichain/governance-pilot-worker
original=/etc/aichain-governance-pilot-worker.env
[[ -f "$original" ]] || { echo 'Worker preflight is incomplete' >&2; exit 2; }
grep -qx 'GOVERNANCE_WORKER_ENABLED=false' "$original" || { echo 'Worker must remain persistently paused' >&2; exit 2; }
[[ $(systemctl is-active aichain-governance-pilot-evidence-worker.service || true) != active ]] || { echo 'Hosted worker service must be stopped' >&2; exit 2; }
temp=$(mktemp /run/hosted-evidence-broadcast.XXXXXXXX)
trap 'rm -f -- "$temp"' EXIT
sed 's/^GOVERNANCE_WORKER_ENABLED=false$/GOVERNANCE_WORKER_ENABLED=true/' "$original" >"$temp"
printf '%s\n' 'GOVERNANCE_EXPECTED_BATCH_ID=0x974b165f5298b37177e2972349a7553e0ad5a55502036501fa729dd7f930d88a' >>"$temp"
chown root:aichain-governance-pilot-worker "$temp"
chmod 0640 "$temp"
systemd-run --unit=aichain-hosted-evidence-broadcast --collect --wait --pipe \
  -p User=aichain-governance-pilot-worker -p Group=aichain-governance-pilot-worker \
  -p WorkingDirectory="$base" -p UMask=0077 -p EnvironmentFile="$temp" \
  /opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node scripts/governance-worker.cjs --broadcast-only --once
