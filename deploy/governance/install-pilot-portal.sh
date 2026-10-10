#!/usr/bin/env bash
set -euo pipefail
archive=${1:?Usage: install-pilot-portal.sh /absolute/path/to/standalone.tar.gz}
[[ "$archive" = /* && -f "$archive" ]] || { echo 'Absolute standalone archive required' >&2; exit 2; }
root=/opt/aichain/orvessian-pilot-portal
unit=/etc/systemd/system/orvessian-pilot-portal.service
if ! id -u orvessian-pilot-portal >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin orvessian-pilot-portal
fi
install -d -o root -g root -m 0755 "$root"
tar -xzf "$archive" -C "$root" --no-same-owner --no-same-permissions
test -f "$root/server.js"
test -d "$root/dist"
test -d "$root/node_modules"
chown -R root:root "$root"
find "$root" -type d -exec chmod 0755 {} +
find "$root" -type f -exec chmod 0644 {} +
install -o root -g root -m 0644 /opt/aichain/governance-pilot-db-setup/orvessian-pilot-portal.service "$unit"
systemctl daemon-reload
echo 'Pilot portal staged. Service remains disabled and the public edge remains closed.'
