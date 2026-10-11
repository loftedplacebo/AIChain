# Exclusive production cluster change review — 11 October 2026

## Current hold

The hosted synthetic pilot now uses Contabo PostgreSQL 17 at loopback port
5433. Its existing DigitalOcean managed database is held as rollback. The
next scheduled local B2 backup begins **12 October 2026 at 03:00 UTC** and
becomes due at **04:00 UTC**. The read-only retirement preflight currently
fails only `scheduled_local_backup_checkpoint`; its last completed upload is
`2026-10-11T09:16:58Z`. No managed database or credential has been retired.

Run `python3 /opt/aichain/governance-pilot-db-setup/preflight-production-cluster-retirement.py`
after 04:00 UTC on 12 October. It requires a healthy local pilot, a validated
latest-due B2 completion marker after the checkpoint, the exact managed object
inventory below, and zero connections to each retained database. A failed
preflight is a stop, not a reason to relax the check.

## Managed inventory, read-only at 14:00 UTC 11 October

The cluster has no connection to a pilot database. Its `max_connections` is
50, with 3 reserved and 11 current cluster-wide connections at inspection.
The six retained databases are owned by `doadmin`:

| Database | Connections | Approximate size |
| --- | ---: | ---: |
| `governance_test` | 0 | 10.7 MB |
| `gov_restore_b2_675760d159ba` | 0 | 9.8 MB |
| `gov_restore_b2_c1e41b11b58a` | 0 | 9.9 MB |
| `gov_restore_b2_c308eaf13583` | 0 | 9.9 MB |
| `gov_restore_b2_c8073805c276` | 0 | 9.8 MB |
| `gov_restore_b2_e60fcb48a34d` | 0 | 9.8 MB |

The remaining application roles are `governance_api`,
`governance_evidence_worker`, and `governance_migrations`. They can log in but
have no superuser, create-database, or create-role privileges. There is no
`governance_prod` database or production role yet.

## Exact change sequence after the hold clears

1. Recheck Contabo hosted, backup, worker and canary health and the managed
   object inventory. Confirm the B2 completion marker covers the 12 October
   scheduled local backup and that the closed local restore evidence remains
   available. Capture the preflight JSON and the current Git commit.
2. Verify all pilot service bindings remain local. Retire the six **named**
   managed databases, then the three **named** old roles. Stop on any changed
   inventory, active database connection, unexpected dependency, or failed SQL
   statement. Do not use `DROP DATABASE ... WITH (FORCE)`, `CASCADE`, broad
   name patterns, or an automatic retry that hides a partial change. The
   `retire-managed-pilot-cluster.py` operator command has read-only default
   mode and a gated `--apply` mode. Review the preflight and exact object list
   before invoking `--apply`; it stops on the first SQL failure and records
   each completed deletion for partial-change review.
3. Re-run the read-only managed inventory. It must show no pilot database,
   restore database, or pilot application role. Rotate the managed `doadmin`
   password in DigitalOcean and replace the retained root-only operator
   credential. Do not copy this password into a service or the repository.
4. Generate the non-secret bundle with
   `npm run governance:prepare-production-exclusive-db-sql`. Review the SQL
   and hashes below. Apply `00-create-empty.sql` on `defaultdb` as `doadmin`,
   then `01-bootstrap.sql` on the newly created `governance_prod` database.
   Run `04-verify-exclusive.sql` on `governance_prod`. The three new roles
   remain `NOLOGIN` until Step 4 provisions separate protected credentials.
   Files `02` and `03` are post-migration grants for Step 4, not Step 3.
5. Restrict DigitalOcean trusted sources to the reviewed production app and
   operator access once the production app endpoint exists. Record the actual
   resource IDs, firewall state, role denial checks and connection budget
   before calling the cluster production ready.

The SQL generator emits these SHA-256 hashes on this revision:

| File | SHA-256 |
| --- | --- |
| `00-create-empty.sql` | `a5046b6d0c1adcec5bbefffb01b718bf9acb24e0d82ef5bc85d323fbf82ddbdd` |
| `01-bootstrap.sql` | `292a3d306d0a6b19c30e923cbe37cfd0f44d2cffca35e8fb332d91102650f9c6` |
| `02-api-grants.sql` | `79308823125d688e1498f027efd39d86faacb3381dd3280111b7cfbf4f492817` |
| `03-worker-grants.sql` | `495be1266ad977ca9d320ae55ac70b83f4056182811656d937c97cfcda8e46ef` |
| `04-verify-exclusive.sql` | `dcf4247a9d142bfd5f4e79d700312a695908d095acc4eba0b8c5b5c4cddad853` |

The old `production-shared-db-sql` bundle is historical and must not be
applied to this exclusive-cluster topology. The current bundle is offline
preparation only; it did not change DigitalOcean.

## Rollback and limits

Before retirement, the managed `governance_test` database is a rollback copy.
After retirement, recovery of synthetic pilot data uses the independently
authenticated Contabo/B2 backup and closed restore process. Recreating the
DigitalOcean copy would be a new reviewed change. Creating an empty production
database does not admit users or traffic. Production backups, app deployment,
WorkOS callbacks, chain selection, replacement-cluster recovery, and capacity
acceptance are later gates.
