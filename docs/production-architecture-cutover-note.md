# Production architecture cutover

Decision: move the synthetic pilot database to self-managed PostgreSQL on the Contabo VPS. Reuse the existing DigitalOcean managed PostgreSQL cluster exclusively for production after the pilot cutover is verified. Keep the production cluster single-node at launch; review a standby once paying customers and an availability target justify it.

## Preparation verified 11 October 2026

- Installed a separate PostgreSQL 17 cluster on the Contabo VPS at loopback port 5433. The existing PostgreSQL 16 cluster remains on port 5432. The pilot passed hosted-health after installation, before cutover.
- Created a **closed rehearsal copy** as `governance_test_candidate` using PostgreSQL 17 tools. All 31 public tables had the same aggregate row counts as the managed source at comparison time, and the restored environment marker was `test`.
- Applied hash-matched API and evidence-worker grants to the closed copy. Restricted role reads passed. The candidate remained isolated during preparation.
- An encrypted local rehearsal capture passed, followed by a fresh closed restore to `gov_restore_contabo_rehearsal` with access revoked and disabled. This capture intentionally omitted live worker journals and was not uploaded to B2; the final coordinated off-host drill remains open.
- Installed a protected administrator binding with the then-current managed profile, and updated the pilot backup, project inventory, canary key check, capacity probe and self-service provisioner to support the reviewed local profile. The managed-profile coordinated backup uploaded to B2 and all pilot health checks passed before the runtime database URLs were switched.
- The final cutover required a coordinated writer pause, fresh capture, final copy, service configuration and restart, off-host backup, closed restore, health and synthetic receipt acceptance. These checks passed as recorded below. The existing managed database remains the rollback source.

## Local pilot cutover and acceptance verified 11 October 2026

- The writer-paused cutover restored the pilot into local `governance_test` on PostgreSQL 17. All 31 public table fingerprints matched the managed source. Portal, API, four registered workers, canary, backup timer, and other pilot timers restarted against the local database. The managed source is retained as rollback.
- The cutover capture coordinated local PostgreSQL and all four worker journals, encrypted the set, and uploaded it to the pilot B2 bucket. The completed set was discovered and authenticated with the separate B2 restore key; backup ID `dd673a2c-5023-4e91-b775-0799c2d907aa`.
- A fresh event submitted through the public API, `contabo-cutover-smoke-2b8635e5ec1f7321103b5df379ee5b0c`, was independently read from local PostgreSQL and checked against Base Sepolia. The receipt signature, record commitment, batch membership, and trusted signer passed; state was `confirmed` with 7,971 confirmations against a 12-confirmation minimum at the acceptance check.
- The B2 archive restored to new local database `gov_restore_b2_987218fb8b3a`. An independent second review passed with all four registered journals. The recovery gate is `review-required`, access is `revoked-and-disabled`, and no service was activated against the restore.
- Post-acceptance hosted-health and backup-health checks both returned `healthy: true`: four projects and four workers covered, no stalled evidence, canary verified, and the latest due backup covered. The scheduled backup uploaded at `2026-10-11T09:16:58Z`.

Retain the managed pilot database and credentials through the agreed rollback checkpoint and next scheduled local backup cycle. Production reuse of the managed cluster remains outstanding.

## Operator code review and local paths

- The staged cutover code retains the managed database as rollback and fails closed if a second cutover is attempted against the active local binding. The reviewed `--offline-cutover` backup mode requires the local profile and stopped writers; the coordinated B2 upload from that mode passed during the live cutover.
- The active capacity installer, project-table ownership probe, database release helper, setup examples and B2 restore helper now target the protected Contabo local binding. The capacity installer read-only preflight reported four projects under the five-project cap; the ownership probe found `governance_migrations` as table owner and a restricted `governance_api` read.
- The historical DigitalOcean bootstrap shell and direct Node entry points now refuse to run while the local pilot binding is active. The older managed backup credential helper also refuses that profile. The source and managed binding remain available for a reviewed rollback and later production repurposing.
- The database release helper's six focused tests passed on the VPS. Updated Python scripts compiled, operator shell scripts passed `bash -n`, and the hosted-health check remained green after staging. No schema release or capacity mutation was run as part of this operator-code update.

## Sequence

1. Inventory the pilot database, roles, worker registry, services, backup scripts, health checks, and connection strings.
2. Install and secure local PostgreSQL on Contabo. Configure dedicated pilot roles, localhost-only access, encrypted off-host backup, monitoring, and restore procedure.
3. Quiesce pilot writes, take an authenticated export, import into local PostgreSQL, and compare schema, row counts, project and worker coverage, and receipt evidence.
4. Repoint pilot portal, API, workers, backup, and health checks. Run synthetic receipt and evidence verification, then complete an independent local-database restore drill.
5. Preserve rollback until the local pilot has run cleanly through a backup cycle. Then remove test database credentials and access from DigitalOcean; remove its pilot database only after the verified retention checkpoint.
6. Prepare the existing DigitalOcean cluster exclusively for production with fresh least-privilege roles, network restrictions, production backups, and replacement-cluster restore acceptance.
7. Deploy production application services separately and run prelaunch capacity, security, and end-to-end acceptance checks before enabling customer sign-up.

## Launch gates

- Pilot copy and local restore verified; test services and monitors point only to Contabo PostgreSQL.
- Production cluster contains no active pilot database or test application credentials.
- Production backup and restore to a replacement cluster verified.
- Production credentials, network access, monitoring, and connection capacity reviewed.
- Single-node recovery limits documented and a standby review trigger set for paying customers.
