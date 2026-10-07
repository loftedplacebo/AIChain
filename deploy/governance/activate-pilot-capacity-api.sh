#!/usr/bin/env bash
set -euo pipefail
root=/opt/aichain/governance-pilot-api/services/governance
current="$root/postgres-customer-directory.cjs"
staged="$root/postgres-customer-directory.cjs.capacity-stage"
previous="$root/postgres-customer-directory.cjs.pre-capacity-20261007"
unit=aichain-governance-synthetic-api.service
expected=82604cd56dc82b38f1e6690fad3493cae5d85cad8de50da38ec4757adf869651
[[ $(id -u) == 0 && -f "$current" && -f "$staged" && ! -e "$previous" ]] || exit 2
[[ $(sha256sum "$staged" | cut -d ' ' -f 1) == "$expected" ]] || exit 2
cp -p "$current" "$previous"
install -o root -g root -m 0644 "$staged" "$current"
if ! systemctl restart "$unit" || ! systemctl is-active --quiet "$unit"; then
  cp -p "$previous" "$current"
  systemctl restart "$unit"
  echo 'Pilot capacity API activation failed; previous module restored.' >&2
  exit 1
fi
echo 'pilot_capacity_api=active'
