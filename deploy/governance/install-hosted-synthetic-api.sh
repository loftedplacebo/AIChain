#!/usr/bin/env bash
set -euo pipefail

# Stage the isolated pilot API without touching the running SQLite demo.
archive=${1:?Usage: install-hosted-synthetic-api.sh /absolute/path/to/source.tar.gz}
[[ "$archive" = /* && -f "$archive" ]] || { echo 'Absolute source archive required' >&2; exit 2; }
root=/opt/aichain/governance-pilot-api
unit=/etc/systemd/system/aichain-governance-synthetic-api.service

if ! id -u aichain-governance-api >/dev/null 2>&1; then
  useradd --system --user-group --home-dir /nonexistent --shell /usr/sbin/nologin aichain-governance-api
fi
install -d -o root -g root -m 0755 "$root"
tar -xzf "$archive" -C "$root" --no-same-owner --no-same-permissions
if [[ ! -d "$root/node_modules/pg" ]]; then
  install -d -o root -g root -m 0755 "$root/node_modules"
  cp -a /opt/aichain/governance-worker/node_modules/. "$root/node_modules/"
fi
test -r "$root/node_modules/jose/package.json"
install -o root -g root -m 0644 "$root/deploy/systemd/aichain-governance-synthetic-api.service" "$unit"
find "$root/services" "$root/sdk" "$root/scripts" -type d -exec chmod 0755 {} +
find "$root/services" "$root/sdk" "$root/scripts" -type f -exec chmod 0644 {} +
chmod 0755 "$root" "$root/node_modules"
systemctl daemon-reload
systemctl is-enabled aichain-governance-synthetic-api.service 2>/dev/null || true
echo 'Isolated pilot API staged. Service remains disabled; no listener or public route was opened.'
