#!/usr/bin/env bash
# Read-only readiness check for the localhost-only Blockscout compatibility spike.

set -euo pipefail

url="${BLOCKSCOUT_URL:-http://127.0.0.1:4000}"
status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' --max-time 15 "$url")"
if [[ "$status" != "200" && "$status" != "302" ]]; then
  echo "Blockscout did not return a ready HTTP response at $url (status $status)." >&2
  exit 1
fi

blocks="$(curl --silent --show-error --max-time 15 "$url/api/v2/main-page/blocks")"
if [[ "$blocks" != *'"height"'* ]]; then
  echo "Blockscout UI is reachable but its block API returned no indexed blocks." >&2
  exit 1
fi

echo "Blockscout readiness check passed at $url (HTTP $status; indexed blocks available)."
