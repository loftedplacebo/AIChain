#!/usr/bin/env bash
set -euo pipefail

current=/opt/aichain/orvessian-pilot-portal
staged=/opt/aichain/orvessian-pilot-portal-waitlist-stage
previous=/opt/aichain/orvessian-pilot-portal-prev-waitlist-20261004
unit=orvessian-pilot-portal.service

[[ -f "$staged/server.js" && -d "$staged/dist" && -d "$staged/node_modules" ]] || {
  echo 'Staged standalone portal is incomplete' >&2
  exit 1
}
[[ -d "$current" && ! -e "$previous" ]] || {
  echo 'Current portal missing or rollback directory already exists' >&2
  exit 1
}
mv "$current" "$previous"
mv "$staged" "$current"
if systemctl restart "$unit" && systemctl is-active --quiet "$unit"; then
  for attempt in 1 2 3 4 5; do
    if curl -fsS --max-time 5 --resolve portal.orvessian.com:443:127.0.0.1 -o /dev/null https://portal.orvessian.com/workspace &&
       curl -fsS --max-time 5 --resolve portal.orvessian.com:443:127.0.0.1 -o /dev/null https://portal.orvessian.com/api/auth/status; then
      echo 'Portal waitlist page active; rollback copy retained.'
      exit 0
    fi
    sleep 1
  done
fi
mv "$current" "$staged"
mv "$previous" "$current"
systemctl restart "$unit"
echo 'Portal health check failed; prior build restored.' >&2
exit 1
