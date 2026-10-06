#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) -eq 0 ]] || { echo 'Run as root' >&2; exit 2; }
base=/opt/aichain/governance-pilot-worker
original=/etc/aichain-governance-pilot-worker.env
[[ -f "$original" && -f /var/lib/aichain-governance-pilot-worker/worker.sqlite ]] || { echo 'Worker preflight is incomplete' >&2; exit 2; }
grep -qx 'GOVERNANCE_WORKER_ENABLED=false' "$original" || { echo 'Worker must remain persistently paused' >&2; exit 2; }
[[ $(systemctl is-active aichain-governance-pilot-evidence-worker.service || true) != active ]] || { echo 'Hosted worker service must be stopped' >&2; exit 2; }
/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node -e 'const {DatabaseSync}=require("node:sqlite");const d=new DatabaseSync("/var/lib/aichain-governance-pilot-worker/worker.sqlite",{readOnly:true});try{const has=d.prepare("SELECT 1 FROM sqlite_master WHERE type=\u0027table\u0027 AND name=\u0027jobs\u0027").get();if(has&&d.prepare("SELECT count(*) n FROM jobs").get().n)throw Error("Preparation is one-time; journal already has a job");}finally{d.close()}'
temp=$(mktemp /run/hosted-evidence-preparation.XXXXXXXX)
trap 'rm -f -- "$temp"' EXIT
sed 's/^GOVERNANCE_WORKER_ENABLED=false$/GOVERNANCE_WORKER_ENABLED=true/' "$original" >"$temp"
printf '%s\n' 'GOVERNANCE_EXPECTED_EVENT_ID=synthetic-first-d99e15cf63551a783a85b989229c99e9' >>"$temp"
chown root:aichain-governance-pilot-worker "$temp"
chmod 0640 "$temp"
systemd-run --unit=aichain-hosted-evidence-prepare --collect --wait --pipe \
  -p User=aichain-governance-pilot-worker -p Group=aichain-governance-pilot-worker \
  -p WorkingDirectory="$base" -p UMask=0077 -p EnvironmentFile="$temp" \
  /opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node scripts/governance-worker.cjs --prepare-only --once
