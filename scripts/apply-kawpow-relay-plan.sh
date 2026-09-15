#!/usr/bin/env bash
# Apply or remove only the generated, tagged relay authorized-key entries.
# This is intentionally separate from rendering and requires --apply/--teardown.
set -euo pipefail

mode="${1:?Usage: $0 --apply|--teardown /absolute/relay-plan /absolute/rendered-dir /absolute/control-key}"
plan="${2:?Missing private relay plan}"
rendered="${3:?Missing rendered relay directory}"
control_key="${4:?Missing controller SSH identity}"
[[ "$mode" == "--apply" || "$mode" == "--teardown" ]] || { echo "Mode must be --apply or --teardown" >&2; exit 2; }
[[ "$plan" == /* && -f "$plan" && "$rendered" == /* && -d "$rendered" && "$control_key" == /* && -f "$control_key" ]] || {
  echo "Plan, rendered directory and control key must be absolute existing paths." >&2; exit 2;
}
[[ -f "$rendered/relay-authorized-keys.txt" && -f "$rendered/relay-known-hosts" ]] || {
  echo "Rendered relay artifacts are incomplete." >&2; exit 2;
}

python_bin="${AICHAIN_PYTHON:-python3}"
mapfile -t relay < <("$python_bin" - "$plan" <<'PY'
import json,sys
d=json.load(open(sys.argv[1],encoding='utf-8'))
r=d['relay']
print(r['address']); print(r['port']); print(r['user'])
PY
)
address="${relay[0]}"; port="${relay[1]}"; user="${relay[2]}"
auth_file=".ssh/authorized_keys"

while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -n "$line" ]] || continue
  quoted_line="$(printf '%q' "$line")"
  if [[ "$mode" == "--apply" ]]; then
    remote="umask 077; mkdir -p .ssh; touch $auth_file; grep -Fqx -- $quoted_line $auth_file || printf '%s\\n' $quoted_line >> $auth_file"
  else
    remote="set -e; test -f $auth_file; tmp=\"$auth_file.aichain.tmp\"; grep -Fvx -- $quoted_line $auth_file >\"$tmp\" || true; mv \"$tmp\" $auth_file"
  fi
  ssh -i "$control_key" -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$rendered/relay-known-hosts" \
    -p "$port" "$user@$address" "$remote"
done < "$rendered/relay-authorized-keys.txt"
echo "Relay key $mode completed for tagged entries. No miner tunnel was started."
