#!/usr/bin/env bash
set -euo pipefail

# Stage a private production API identity and a disabled unit on the existing
# Contabo VPS. This command never starts a service or creates a public route.
source_unit=/opt/aichain/governance-pilot-db-setup/orvessian-production-api.service
unit=/etc/systemd/system/orvessian-production-api.service
release=/opt/aichain/orvessian-production-api
principal=orvessian-prod-api
expected_sha256=0dc060c68b2c9dc3ece4bb734c28a5dccc3e3ac9e35911910c1ccfbe125e6dc0

[[ $(id -u) -eq 0 ]] || { echo 'Root required' >&2; exit 2; }
[[ $# -le 1 && ( $# -eq 0 || ${1-} == --apply ) ]] || {
  echo 'Usage: stage-production-api-host.sh [--apply]' >&2; exit 2;
}
[[ -f $source_unit && ! -L $source_unit && $(stat -c '%u' "$source_unit") == 0 &&
   $(stat -c '%a' "$source_unit") == 644 ]] || {
  echo 'Reviewed root-owned production unit required' >&2; exit 2;
}
echo "$expected_sha256  $source_unit" | sha256sum -c --status || {
  echo 'Production unit hash mismatch' >&2; exit 2;
}
systemctl is-active --quiet aichain-governance-synthetic-api.service || {
  echo 'Pilot API must be healthy before staging' >&2; exit 2;
}
systemctl is-active --quiet orvessian-pilot-portal.service || {
  echo 'Pilot portal must be healthy before staging' >&2; exit 2;
}
if id "$principal" >/dev/null 2>&1 || [[ -e $release || -L $release || -e $unit || -L $unit ]]; then
  echo 'Production host staging already exists; inspect before retrying' >&2; exit 2
fi
if [[ $# -eq 0 ]]; then
  echo 'production_api_host=ready_to_stage;service=not_started;public_route=unchanged'
  exit 0
fi

useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$principal"
install -d -o root -g root -m 0755 "$release"
install -o root -g root -m 0644 "$source_unit" "$unit"
systemctl daemon-reload
[[ $(systemctl is-enabled orvessian-production-api.service) == disabled ]] || {
  echo 'Production unit was unexpectedly enabled; inspect staged state' >&2; exit 1;
}
[[ $(systemctl is-active orvessian-production-api.service) == inactive ]] || {
  echo 'Production unit was unexpectedly active; inspect staged state' >&2; exit 1;
}
[[ $(stat -c '%U:%G %a' "$release") == 'root:root 755' ]] || {
  echo 'Production release directory ownership mismatch' >&2; exit 1;
}
echo 'production_api_host=staged;unit=disabled;service=inactive;public_route=unchanged'
