#!/bin/sh
set -eu
# Non-sensitive installation only: no state import, key transfer or service start.
getent passwd aichain-governance >/dev/null || useradd --system --home /var/lib/aichain-governance-worker --shell /usr/sbin/nologin aichain-governance
install -d -o aichain-governance -g aichain-governance -m 0700 /var/lib/aichain-governance-worker /var/lib/aichain-governance-worker/keys
install -o root -g root -m 0644 /opt/aichain/governance-worker/deploy/systemd/aichain-governance-worker.service /etc/systemd/system/aichain-governance-worker.service
if [ ! -e /etc/aichain-governance-worker.env ]; then
 install -o root -g root -m 0600 /root/governance-worker-stage/worker.env.example /etc/aichain-governance-worker.env
fi
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/aichain-governance-worker.service
printf 'Worker installed, stopped, and disabled pending state/key migration.\n'
systemctl is-enabled aichain-governance-worker.service || true
systemctl is-active aichain-governance-worker.service || true
