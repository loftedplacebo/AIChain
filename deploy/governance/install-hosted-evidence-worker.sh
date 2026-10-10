#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) -eq 0 ]] || { echo 'Run as root' >&2; exit 2; }
base=/opt/aichain/governance-pilot-worker
state=/var/lib/aichain-governance-pilot-worker
unit=aichain-governance-pilot-evidence-worker.service
[[ -f "$base/scripts/governance-worker.cjs" && -d "$base/services/governance" && -d "$base/sdk/typescript" ]] || { echo 'Staged worker source missing' >&2; exit 2; }
[[ -d /opt/aichain/governance-pilot-api/node_modules/pg && -d /opt/aichain/governance-pilot-api/node_modules/ethers ]] || { echo 'Runtime dependencies missing' >&2; exit 2; }
if ! getent passwd aichain-governance-pilot-worker >/dev/null; then
  useradd --system --home "$state" --shell /usr/sbin/nologin aichain-governance-pilot-worker
fi
install -d -o aichain-governance-pilot-worker -g aichain-governance-pilot-worker -m 0700 "$state" "$state/keys"
ln -sfn /opt/aichain/governance-pilot-api/node_modules "$base/node_modules"
chown -R root:root "$base"
find "$base" -type d -exec chmod 0755 {} +
find "$base" -type f -exec chmod 0644 {} +
install -o root -g root -m 0644 "$base/deploy/systemd/$unit" "/etc/systemd/system/$unit"
systemctl daemon-reload
systemd-analyze verify "/etc/systemd/system/$unit"
echo 'Hosted evidence worker staged; service remains disabled until configured and verified.'
