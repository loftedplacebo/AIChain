#!/usr/bin/env bash
set -euo pipefail

archive=/opt/aichain/orvessian-pilot-portal-key-reauth-final-20261008.tar.gz
expected=0e968b7472d6ddeae155533928620eba5172714cdcf86ef3ce7aa6929dac1c37
current=/opt/aichain/orvessian-pilot-portal
staged=/opt/aichain/orvessian-pilot-portal-key-reauth-final-stage
previous=/opt/aichain/orvessian-pilot-portal-prev-key-reauth-final-20261008
unit=orvessian-pilot-portal.service

[[ $(id -u) == 0 && -f "$archive" && -d "$current" && ! -e "$previous" && ! -e "$staged" ]] || exit 2
[[ $(sha256sum "$archive" | cut -d ' ' -f 1) == "$expected" ]] || exit 2
mkdir -m 0755 "$staged"
tar -xzf "$archive" -C "$staged" --no-same-owner --no-same-permissions
[[ -f "$staged/server.js" && -d "$staged/dist" && -d "$staged/node_modules" ]] || exit 2
chown -R root:root "$staged"
find "$staged" -type d -exec chmod 0755 {} +
find "$staged" -type f -exec chmod 0644 {} +
mv "$current" "$previous"
mv "$staged" "$current"

healthy=0
if systemctl restart "$unit" && systemctl is-active --quiet "$unit"; then
  for attempt in {1..15}; do
    if curl --fail --silent --max-time 2 -H 'Host: portal.orvessian.com' http://127.0.0.1:3002/workspace >/dev/null; then
      healthy=1
      break
    fi
    sleep 1
  done
fi
if [[ "$healthy" != 1 ]]; then
  mv "$current" "$staged"
  mv "$previous" "$current"
  systemctl restart "$unit"
  echo 'Portal activation failed; previous build restored.' >&2
  exit 1
fi
echo 'pilot_portal_key_reauth_final_build=active'
