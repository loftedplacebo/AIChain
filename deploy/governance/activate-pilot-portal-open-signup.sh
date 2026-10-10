#!/usr/bin/env bash
set -euo pipefail
archive=/opt/aichain/orvessian-pilot-portal-open-signup.tar.gz
expected=cad5a3e7a22ac7bd7485f8ab6f3a8aab574468fd8a88c7f2b4e9a626967be7dd
current=/opt/aichain/orvessian-pilot-portal
staged=/opt/aichain/orvessian-pilot-portal-open-signup-stage
previous=/opt/aichain/orvessian-pilot-portal-prev-open-signup-20261007
unit=orvessian-pilot-portal.service
[[ $(id -u) == 0 && -f "$archive" && -d "$current" && ! -e "$previous" ]] || exit 2
[[ $(sha256sum "$archive" | cut -d ' ' -f 1) == "$expected" ]] || exit 2
if [[ ! -e "$staged" ]]; then
  mkdir -m 0755 "$staged"
  tar -xzf "$archive" -C "$staged" --no-same-owner --no-same-permissions
fi
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
echo 'pilot_portal_open_signup_build=active'
