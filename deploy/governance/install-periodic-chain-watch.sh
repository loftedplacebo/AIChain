#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) -eq 0 ]] || { echo 'Run as root' >&2; exit 2; }
stage=/tmp/aichain-periodic-chain-watch
runtime=/opt/aichain/orvessian-chain-watch
state=/var/lib/orvessian-chain-watch
environment=/etc/orvessian-chain-watch.env
unit=/etc/systemd/system/orvessian-base-health-watcher.service

[[ ! -e "$environment" ]] || { echo 'Agent environment already exists; inspect before replacing' >&2; exit 2; }
[[ -f "$stage/periodic-base-health-agent.py" && -f "$stage/orvessian_ingest.py" && -f "$stage/orvessian-base-health-watcher.service" && -f "$stage/configure-periodic-chain-watch.py" ]] || { echo 'Staged agent files are incomplete' >&2; exit 2; }
systemctl is-active --quiet orvessian-base-health-watcher.service && { echo 'Agent service is already active; inspect before reinstalling' >&2; exit 2; }

if ! getent passwd orvessian-chain-watch >/dev/null; then
  useradd --system --home "$state" --shell /usr/sbin/nologin orvessian-chain-watch
fi
install -d -o root -g root -m 0755 "$runtime"
install -d -o orvessian-chain-watch -g orvessian-chain-watch -m 0700 "$state"
install -o root -g root -m 0644 "$stage/periodic-base-health-agent.py" "$runtime/periodic-base-health-agent.py"
install -o root -g root -m 0644 "$stage/orvessian_ingest.py" "$runtime/orvessian_ingest.py"
install -o root -g root -m 0644 "$stage/orvessian-base-health-watcher.service" "$unit"
install -o root -g root -m 0644 "$stage/configure-periodic-chain-watch.py" /opt/aichain/configure-periodic-chain-watch.py
systemctl daemon-reload
echo 'Agent runtime installed; configure its protected environment before enabling it.'
