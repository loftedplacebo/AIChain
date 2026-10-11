#!/usr/bin/env bash
# Run interactively on the Orvessian Contabo VPS. Enter each credential from the
# matching 1Password Database item. Input is hidden and no password is stored.
set -euo pipefail
umask 077

# Historical bootstrap only. Never mutate the retained managed rollback copy
# while the active pilot binding points to Contabo PostgreSQL.
binding=/etc/aichain/pilot-database-binding.json
if [[ -e "$binding" ]]; then
 python3 - "$binding" <<'PY'
import json
import pathlib
import sys
binding = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8'))
if binding.get('profile') != 'managed':
    raise SystemExit('Managed test bootstrap is disabled after the Contabo cutover')
PY
fi

stage=/opt/aichain/governance-pilot-db-setup
host=orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com
ca=/etc/aichain/governance/digitalocean-ca.crt
node=/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node
export NODE_PATH=/opt/aichain/governance-worker/node_modules
export PGSSLMODE=verify-full PGSSLROOTCERT="$ca"
trap 'unset admin_password migration_password api_password worker_password PG_SECRET PGPASSWORD' EXIT

for file in "$ca" "$stage/digitalocean-test-bootstrap.sql" "$stage/postgres-api-grants.sql" \
 "$stage/postgres-evidence-worker-grants.sql" "$stage/digitalocean-test-apply.cjs"; do
 test -f "$file" || { printf 'Missing setup file: %s\n' "$file" >&2; exit 1; }
done
test -x "$node"
cd "$stage"

printf 'Isolated DigitalOcean governance_test setup; no services will be started.\n'
read -r -s -p '1Password doadmin database password: ' admin_password </dev/tty
printf '\n'
PGPASSWORD="$admin_password" psql -X -v ON_ERROR_STOP=1 -h "$host" -p 25060 \
 -U doadmin -d governance_test -f digitalocean-test-bootstrap.sql
unset admin_password

read -r -s -p '1Password governance_migrations database password: ' migration_password </dev/tty
printf '\n'
PG_SECRET="$migration_password" "$node" digitalocean-test-apply.cjs migrate
PGPASSWORD="$migration_password" psql -X -v ON_ERROR_STOP=1 --single-transaction \
 -h "$host" -p 25060 -U governance_migrations -d governance_test \
 -f postgres-api-grants.sql -f postgres-evidence-worker-grants.sql
unset migration_password

read -r -s -p '1Password governance_api database password: ' api_password </dev/tty
printf '\n'
PG_SECRET="$api_password" "$node" digitalocean-test-apply.cjs api
unset api_password

read -r -s -p '1Password governance_evidence_worker database password: ' worker_password </dev/tty
printf '\n'
PG_SECRET="$worker_password" "$node" digitalocean-test-apply.cjs worker
unset worker_password
printf 'Database migration, grants, and both runtime profiles verified.\n'
