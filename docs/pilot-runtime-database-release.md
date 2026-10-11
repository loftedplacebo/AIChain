# Hosted pilot runtime and database releases

These procedures cover the synthetic `test` pilot on the VPS. They do not
change the current build, schema, project cap or partner workload by themselves.
Each release record must identify the Git commit, archive or SQL SHA-256 values,
target host, prior revision, latest validated B2 backup ID, and acceptance
results. Run the repository `pilot` and `sdk` gates before preparing artifacts.

## API and worker as one runtime release

The workers load `node_modules` from the API directory, so release them as a
coupled pair. Build both archives from one reviewed commit on Linux using Node
24 and `npm ci --omit=dev`. The packager includes only `scripts`,
`services/governance`, `sdk/typescript`, and API `node_modules`; it rejects
unexpected symlinks and omits the dependency command links under `.bin`.
It writes deterministic archives and prints their SHA-256 values:

```sh
python3 deploy/governance/package-pilot-runtime.py \
  --source /absolute/reviewed/checkout \
  --output-dir /absolute/release/artifacts --release-id RELEASE
```

Transfer the two archives and reviewed `release-pilot-runtime.py` to root-owned
paths on the VPS. Confirm each archive's SHA-256 against the release record.
The script refuses an inactive registered worker, another backup, concurrent
worker provisioning, untrusted archive contents, or a reused release ID. It
stages both archives before pausing the portal, API and every registered worker.
It swaps both directories, restarts services, and requires the full hosted
health check. A failed health check restores both prior directories. No worker
journal or secret file is packaged or moved.

```sh
python3 /opt/aichain/governance-pilot-db-setup/release-pilot-runtime.py \
  activate --api-archive /opt/aichain/releases/RELEASE-api.tar.gz \
  --api-sha256 API_SHA256 \
  --worker-archive /opt/aichain/releases/RELEASE-worker.tar.gz \
  --worker-sha256 WORKER_SHA256 --release-id RELEASE
python3 /opt/aichain/governance-pilot-db-setup/check-pilot-hosted-health.py
python3 /opt/aichain/governance-pilot-db-setup/check-pilot-backup-health.py
```

If post-release acceptance fails, stop submissions and use the retained prior
directories:

```sh
python3 /opt/aichain/governance-pilot-db-setup/release-pilot-runtime.py \
  rollback --release-id RELEASE
```

Review an API-ready 200 response, every registered worker, zero stalled jobs,
revocation freshness, a scoped synthetic receipt with independently verified
evidence, and completed backup coverage before closing the release. Preserve
the old directories and archives until that record is complete. If automatic
rollback itself fails, leave submissions stopped and inspect the protected
release directories and service logs before intervening.

## Database migration and rollback

Each schema change needs a reviewed `up.sql` and `down.sql` pair. Keep the
application compatible with both schemas during the release window. The down
script must preserve existing customer and receipt data; a table or column
drop that loses data is not an acceptable automatic rollback. Run the SQL pair
against a disposable restored pilot database before using it on the live test
database, and record the restore review. SQL may not contain psql meta-commands
or its own transaction controls.

The database release script requires root-owned, SHA-256 pinned SQL files, the
protected local Contabo PostgreSQL 17 administrator binding, a healthy completed B2 marker less
than fifteen minutes old, all registered workers active, and the backup and
worker-registry locks. It stops the portal, API and workers, runs one PostgreSQL
transaction, records the release and both SQL digests in the database, then
restarts services and checks full hosted health. A failed application health
check runs the reviewed down SQL. A failed explicit rollback reapplies the up
SQL. If a compensating transaction fails, treat the services as stopped and
recover under the database incident procedure; never assume success from the
command exit alone.

Take a new coordinated B2 backup immediately before the maintenance window,
confirm `check-pilot-backup-health.py` is healthy, and apply within fifteen
minutes. Use a unique release ID and the exact reviewed digests:

```sh
python3 /opt/aichain/governance-pilot-db-setup/release-pilot-database.py \
  apply --up /opt/aichain/releases/RELEASE-up.sql \
  --up-sha256 UP_SHA256 --down /opt/aichain/releases/RELEASE-down.sql \
  --down-sha256 DOWN_SHA256 --release-id RELEASE
```

An explicit rollback uses the same four file and digest arguments with
`rollback` in place of `apply`. Verify the database release record, runtime
health, scoped receipt behavior, and backup coverage afterwards. The B2 closed
restore drill remains the disaster recovery path if transactional reversal is
not possible; it restores to a new closed database and requires a separate
review before any service activation.

The runtime and database scripts are installed tooling only until a specific
reviewed artifact or migration is supplied. This guide does not authorize a
project-cap increase; [capacity waves](pilot-capacity-waves.md) have separate
measurement and admission gates.
