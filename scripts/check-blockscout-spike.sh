#!/usr/bin/env bash
# Read-only readiness check for the localhost-only Blockscout compatibility spike.

set -euo pipefail

url="${BLOCKSCOUT_URL:-http://127.0.0.1:4000}"
status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 "$url")"
if [[ "$status" != "200" && "$status" != "302" ]]; then
  echo "Blockscout did not return a ready HTTP response at $url (status $status)." >&2
  exit 1
fi
echo "Blockscout HTTP readiness check passed at $url (status $status)."
