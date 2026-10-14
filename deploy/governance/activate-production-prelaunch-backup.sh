#!/usr/bin/env bash
set -euo pipefail

# Install a reviewed prelaunch-only timer. Persistent=true may run it at once.
source_dir=/opt/aichain/governance-pilot-db-setup
unit_dir=/etc/systemd/system
service=orvessian-production-prelaunch-backup.service
timer=orvessian-production-prelaunch-backup.timer
runner=run-production-prelaunch-backup.py
service_sha256=5c7c45aa11272d5a15041de4ae5dcbb92bb3b2441ce3544dd6b9207863ddbc3f
timer_sha256=e6aed836e9fb3efa3753b142982a6ce08ac37a85a0ad21d2f2c459eab998bc07
runner_sha256=c6cd3008a1c6500162a8c10594fff853c0573a098fadb64b07ff8770552f6efc

[[ $(id -u) -eq 0 ]] || { echo 'Root required' >&2; exit 2; }
[[ $# -le 1 && ( $# -eq 0 || ${1-} == --apply ) ]] || {
  echo 'Usage: activate-production-prelaunch-backup.sh [--apply]' >&2; exit 2;
}
for item in "$service" "$timer" "$runner"; do
  [[ -f $source_dir/$item && ! -L $source_dir/$item &&
     $(stat -c '%u' "$source_dir/$item") == 0 &&
     $(stat -c '%a' "$source_dir/$item") == 644 ]] || {
    echo 'Reviewed root-owned Production backup source required' >&2; exit 2;
  }
done
echo "$service_sha256  $source_dir/$service" | sha256sum -c --status
echo "$timer_sha256  $source_dir/$timer" | sha256sum -c --status
echo "$runner_sha256  $source_dir/$runner" | sha256sum -c --status
[[ ! -e $unit_dir/$service && ! -L $unit_dir/$service &&
   ! -e $unit_dir/$timer && ! -L $unit_dir/$timer ]] || {
  echo 'Production backup units already exist; inspect before retrying' >&2; exit 2;
}
python3 "$source_dir/$runner"
python3 "$source_dir/check-pilot-hosted-health.py" >/dev/null
systemd-analyze verify "$source_dir/$service" "$source_dir/$timer"
[[ $(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  --resolve api-prod.orvessian.com:443:127.0.0.1 \
  --header 'Content-Type: application/json' --data '{}' \
  https://api-prod.orvessian.com/v1/auth/workos-webhook) == 401 ]] || {
  echo 'Production webhook-only edge prerequisite failed' >&2; exit 2;
}
if [[ $# -eq 0 ]]; then
  echo 'production_prelaunch_backup_timer=ready;upload=not_started'
  exit 0
fi

install -o root -g root -m 0644 "$source_dir/$service" "$unit_dir/$service"
install -o root -g root -m 0644 "$source_dir/$timer" "$unit_dir/$timer"
systemctl daemon-reload
systemctl enable --now "$timer"
[[ $(systemctl is-enabled "$timer") == enabled &&
   $(systemctl is-active "$timer") == active ]] || {
  echo 'Production backup timer activation requires operator review' >&2; exit 1;
}
echo 'production_prelaunch_backup_timer=active;first_run=inspect_service_and_marker'
