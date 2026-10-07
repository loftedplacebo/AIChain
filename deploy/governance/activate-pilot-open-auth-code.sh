#!/usr/bin/env bash
set -euo pipefail
root=/opt/aichain/governance-pilot-api/services/governance
current="$root/workos-auth.cjs"
staged="$root/workos-auth.cjs.open-pilot-stage"
previous="$root/workos-auth.cjs.pre-open-pilot-20261007"
unit=aichain-governance-synthetic-api.service
expected=13697af3fe4ea141ec41e6a38000302d951c9fac9bb0db906fe930bc154bf9c9
[[ $(id -u) == 0 && -f "$current" && -f "$staged" && ! -e "$previous" ]] || exit 2
[[ $(sha256sum "$staged" | cut -d ' ' -f 1) == "$expected" ]] || exit 2
cp -p "$current" "$previous"
install -o root -g root -m 0644 "$staged" "$current"
if ! systemctl restart "$unit" || ! systemctl is-active --quiet "$unit"; then
  cp -p "$previous" "$current"
  systemctl restart "$unit"
  echo 'Pilot auth code activation failed; previous module restored.' >&2
  exit 1
fi
echo 'pilot_auth_code=open-capable;admission_mode=unchanged'
