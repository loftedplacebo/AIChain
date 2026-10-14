#!/usr/bin/env bash
set -euo pipefail

# Stage an isolated Production portal identity and disabled unit. No listener
# starts and the existing 404-only Production edge remains unchanged.
source_unit=/opt/aichain/governance-pilot-db-setup/orvessian-production-portal.service
unit=/etc/systemd/system/orvessian-production-portal.service
release=/opt/aichain/orvessian-production-portal
principal=orvessian-prod-portal
expected_sha256=0c91315e09d08772c819de75f72109de6a568e606439d8c23da8baa8bd2eef89

[[ $(id -u) -eq 0 ]] || { echo 'Root required' >&2; exit 2; }
[[ $# -le 1 && ( $# -eq 0 || ${1-} == --apply ) ]] || {
  echo 'Usage: stage-production-portal-host.sh [--apply]' >&2; exit 2;
}
[[ -f $source_unit && ! -L $source_unit && $(stat -c '%u' "$source_unit") == 0 &&
   $(stat -c '%a' "$source_unit") == 644 ]] || {
  echo 'Reviewed root-owned Production portal unit required' >&2; exit 2;
}
echo "$expected_sha256  $source_unit" | sha256sum -c --status || {
  echo 'Production portal unit hash mismatch' >&2; exit 2;
}
systemctl is-active --quiet aichain-governance-synthetic-api.service || {
  echo 'Pilot API must be healthy before staging' >&2; exit 2;
}
systemctl is-active --quiet orvessian-pilot-portal.service || {
  echo 'Pilot portal must be healthy before staging' >&2; exit 2;
}
if id "$principal" >/dev/null 2>&1 || [[ -e $release || -L $release || -e $unit || -L $unit ]]; then
  echo 'Production portal staging already exists; inspect before retrying' >&2; exit 2
fi
if [[ $# -eq 0 ]]; then
  echo 'production_portal_host=ready_to_stage;service=not_started;public_route=unchanged'
  exit 0
fi

useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$principal"
install -d -o root -g root -m 0755 "$release"
install -o root -g root -m 0644 "$source_unit" "$unit"
systemctl daemon-reload
[[ $(systemctl is-enabled orvessian-production-portal.service) == disabled ]] || {
  echo 'Production portal unit was unexpectedly enabled' >&2; exit 1;
}
[[ $(systemctl is-active orvessian-production-portal.service) == inactive ]] || {
  echo 'Production portal unit was unexpectedly active' >&2; exit 1;
}
[[ $(stat -c '%U:%G %a' "$release") == 'root:root 755' ]] || {
  echo 'Production portal release directory ownership mismatch' >&2; exit 1;
}
echo 'production_portal_host=staged;unit=disabled;service=inactive;public_route=unchanged'
