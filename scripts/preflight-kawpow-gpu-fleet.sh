#!/usr/bin/env bash
# Read-only fleet readiness check. It never starts nodes, opens ports, or edits hosts.
set -euo pipefail

inventory="${1:?Usage: $0 /absolute/gpu-fleet.json /absolute/evidence-dir}"
evidence_dir="${2:?Missing evidence directory}"
project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
python_bin="${AICHAIN_PYTHON:-python3}"
[[ "$inventory" == /* && "$evidence_dir" == /* ]] || { echo "Paths must be absolute." >&2; exit 2; }
command -v "$python_bin" >/dev/null 2>&1 || { echo "Python not found: $python_bin" >&2; exit 2; }
"$python_bin" "$project_root/scripts/validate-kawpow-gpu-fleet.py" "$inventory"
mkdir -p "$evidence_dir"

readarray -t fleet < <("$python_bin" - "$inventory" <<'PY'
import json, sys
d=json.load(open(sys.argv[1], encoding='utf-8'))
print(d['sshIdentity'])
for h in d['hosts']:
 print('|'.join((h['id'],h['region'],h['address'],str(h['port']),h['user'],h['expectedGpu'],h['computeCapability'])))
PY
)
identity="${fleet[0]}"
identity="${identity%$'\r'}"
[[ -f "$identity" ]] || { echo "SSH identity not found: $identity" >&2; exit 2; }

for entry in "${fleet[@]:1}"; do
  entry="${entry%$'\r'}"
  IFS='|' read -r id region address port user expected_gpu compute <<<"$entry"
  output="$evidence_dir/${id}-preflight.txt"
  ssh -i "$identity" -o BatchMode=yes -o ConnectTimeout=15 -p "$port" "$user@$address" \
    "nvidia-smi --query-gpu=name,compute_cap,driver_version,temperature.gpu --format=csv,noheader; command -v git cmake g++ make python3 go nvidia-smi" >"$output"
  grep -Fiq "$expected_gpu" "$output" || { echo "$id GPU does not match expected model" >&2; exit 1; }
  grep -Fq "$compute" "$output" || { echo "$id compute capability does not match" >&2; exit 1; }
done

"$python_bin" - "$inventory" "$evidence_dir/manifest.json" <<'PY'
import hashlib,json,sys,time
d=json.load(open(sys.argv[1],encoding='utf-8'))
result={"schema":"aichain.kawpow-gpu-fleet-manifest","schemaVersion":"0.1.0-draft","createdAt":int(time.time()),"scope":d["scope"],"hosts":[]}
for h in d["hosts"]:
 result["hosts"].append({k:h[k] for k in ("id","region","expectedGpu","computeCapability")})
open(sys.argv[2],"w",encoding="utf-8").write(json.dumps(result,indent=2)+"\n")
PY
echo "Read-only preflight passed. Evidence: $evidence_dir"
