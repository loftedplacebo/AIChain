#!/usr/bin/env bash
set -euo pipefail

# Stage a pinned, tested portal artifact behind the closed Production edge.
archive=/opt/aichain/releases/3da61c6-production-portal.tar.gz
release=/opt/aichain/orvessian-production-portal
temporary=/opt/aichain/.orvessian-production-portal-stage-3da61c6
manifest=/opt/aichain/governance-pilot-db-setup/production-portal-release.json
expected_sha256=55ca21e645dcaa670d25047338e0fbab0cc966613e89ace94e019b52c4cabfad
manifest_sha256=6a33cc3944d0611b62ce788ca8a3acb1c6dff8e27ea1e2839b5780556fc689c4

[[ $(id -u) -eq 0 ]] || { echo 'Root required' >&2; exit 2; }
[[ $# -le 1 && ( $# -eq 0 || ${1-} == --apply ) ]] || {
  echo 'Usage: stage-production-portal-release.sh [--apply]' >&2; exit 2;
}
[[ -f $archive && ! -L $archive && $(stat -c '%u' "$archive") == 0 &&
   $(stat -c '%a' "$archive") == 644 && $(stat -c '%s' "$archive") -lt 250000000 ]] || {
  echo 'Pinned production portal archive required' >&2; exit 2;
}
echo "$expected_sha256  $archive" | sha256sum -c --status || {
  echo 'Production portal archive hash mismatch' >&2; exit 2;
}
python3 /opt/aichain/governance-pilot-db-setup/verify-production-portal-archive.py >/dev/null
[[ -f $manifest && ! -L $manifest && $(stat -c '%u' "$manifest") == 0 ]] || {
  echo 'Pinned Production portal manifest required' >&2; exit 2;
}
echo "$manifest_sha256  $manifest" | sha256sum -c --status
[[ -d $release && ! -L $release && $(stat -c '%U:%G %a' "$release") == 'root:root 755' ]] || {
  echo 'Isolated root-owned production portal directory required' >&2; exit 2;
}
[[ -z $(find "$release" -mindepth 1 -maxdepth 1 -print -quit) && ! -e $temporary && ! -L $temporary ]] || {
  echo 'Production portal release staging requires review' >&2; exit 2;
}
[[ $(systemctl is-enabled orvessian-production-portal.service) == disabled &&
   $(systemctl is-active orvessian-production-portal.service) == inactive ]] || {
  echo 'Production portal must remain disabled and inactive' >&2; exit 2;
}
systemctl is-active --quiet aichain-governance-synthetic-api.service
systemctl is-active --quiet orvessian-pilot-portal.service
[[ $(curl --silent --show-error --max-time 5 --output /dev/null --write-out '%{http_code}' \
  --resolve prod.orvessian.com:443:127.0.0.1 https://prod.orvessian.com/) == 404 ]] || {
  echo 'Production public portal must remain closed' >&2; exit 2;
}

if [[ $# -eq 0 ]]; then
  echo 'production_portal_release=ready;service=inactive;public_route=404'
  exit 0
fi

install -d -o root -g root -m 0755 "$temporary"
tar -xzf "$archive" -C "$temporary" --no-same-owner
install -o root -g root -m 0644 "$manifest" "$temporary/PRODUCTION-PORTAL-RELEASE.json"
[[ -f $temporary/server.js && -f $temporary/package.json &&
   -f $temporary/dist/server/index.js &&
   -f $temporary/node_modules/vinext/package.json &&
   -d $temporary/public ]] || {
  echo 'Production portal release contents incomplete' >&2; exit 1;
}
rmdir "$release"
mv "$temporary" "$release"
[[ $(systemctl is-active orvessian-production-portal.service) == inactive ]] || {
  echo 'Production portal unexpectedly active after staging' >&2; exit 1;
}
echo 'production_portal_release=staged;service=inactive;public_route=404'
