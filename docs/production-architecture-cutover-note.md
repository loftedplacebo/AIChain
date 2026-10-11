# Production architecture cutover

Decision: move the synthetic pilot database to self-managed PostgreSQL on the Contabo VPS. Reuse the existing DigitalOcean managed PostgreSQL cluster exclusively for production after the pilot cutover is verified. Keep the production cluster single-node at launch; review a standby once paying customers and an availability target justify it.

## Preparation verified 11 October 2026

- Installed a separate PostgreSQL 17 cluster on the Contabo VPS at loopback port 5433. The existing PostgreSQL 16 cluster remains on port 5432. The live pilot still connects to the managed database and passed hosted-health after installation.
- Created a **closed rehearsal copy** as `governance_test_candidate` using PostgreSQL 17 tools. All 31 public tables had the same aggregate row counts as the managed source at comparison time, and the restored environment marker was `test`.
- Applied hash-matched API and evidence-worker grants to the closed copy. Restricted role reads passed. This is preparation only; no pilot service points at the candidate.
- An encrypted local rehearsal capture passed, followed by a fresh closed restore to `gov_restore_contabo_rehearsal` with access revoked and disabled. This capture intentionally omitted live worker journals and was not uploaded to B2; the final coordinated off-host drill remains open.
- Installed a protected administrator binding with the current managed profile, and updated the pilot backup, project inventory, canary key check, capacity probe and self-service provisioner to support the reviewed local profile. The managed-profile coordinated backup uploaded to B2 and all pilot health checks passed after the change. No runtime database URL has been switched.
- The final cutover still requires a coordinated writer pause, fresh capture, final copy, service configuration and restart, off-host backup, closed restore, health and synthetic receipt acceptance. The existing managed database remains the rollback source.

Do not retire the managed pilot database or credentials until the Contabo copy, services, backups, and a fresh restore have passed acceptance.

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
