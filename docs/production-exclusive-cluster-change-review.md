# Exclusive production cluster change review — 11 October 2026

## Accelerated checkpoint and completed retirement

The hosted synthetic pilot uses Contabo PostgreSQL 17 at loopback port 5433.
The owner requested an on-demand coordinated backup to advance the cutover.
Backup `c79ba135-5b42-417e-b3bd-cd1955853f12` completed at 14:40:49 UTC
on 11 October. Its B2 archive was independently authenticated and restored
into closed local database `gov_restore_b2_a451c6e5b6b2`; all registered
worker journals passed review. The read-only retirement preflight now checks
this exact backup and restore. The unattended 12 October 03:00 UTC backup is
a separate operational check and remains monitored.

Run `python3 /opt/aichain/governance-pilot-db-setup/preflight-production-cluster-retirement.py`
immediately before any change. It requires a healthy local pilot, a validated
B2 completion marker for the reviewed backup, the closed restore, the exact
managed object inventory below, and zero connections to each retained
database. A failed preflight is a stop, not a reason to relax the check.

The preflight and exact-object dry run passed on 11 October. The six named
pilot and historical restore databases and three named pilot roles were then
retired, with each deletion reported. The follow-up managed inventory contained
no pilot database or role. The hash-pinned `00-create-empty.sql`,
`01-bootstrap.sql`, and `04-verify-exclusive.sql` were applied successfully.
The resulting `governance_prod` database has no connections and is owned by
`doadmin`; its API, worker, and migration roles are restricted `NOLOGIN` roles.
The independent production bootstrap verification and hosted synthetic-pilot
health check passed. Customer access remains closed.

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

## Exact change sequence and remaining controls

### 11 October credential-rotation staging checkpoint

The root-owned production admin installer was staged on Contabo at
`/opt/aichain/governance-pilot-db-setup/configure-production-database-admin.py`
with SHA-256 `deccafd3d5fffbb8ecd1d8bef178e860b8cda08229554fd92c1633cd88f8ddcf`.
The managed inventory and empty-bootstrap verifier were updated to prefer its
new production-only credential file after installation; their staged hashes
match Git. Python syntax checks passed. The installer has **not** been run,
and `/etc/aichain/production/database-admin-password` did not exist at the
staging check. A read-only inventory still showed only `governance_prod`,
zero database connections, and the three `NOLOGIN` production roles. The
synthetic pilot health check remained green. The next database operation is
the owner's DigitalOcean `doadmin` rotation followed by the hidden-prompt
installer, then a fresh read-only inventory. No production role login,
migration or service was activated at this checkpoint.

1. Recheck Contabo hosted, backup, worker and canary health and the managed
   object inventory. Confirm the B2 completion marker covers the reviewed
   on-demand backup and that the closed local restore evidence remains
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
3. The read-only managed inventory showed no pilot database, restore database,
   or pilot application role before the production bootstrap. **Still open:**
   rotate the managed `doadmin` password in DigitalOcean and replace the
   retained root-only operator credential. Do not copy this password into a
   service or the repository.
4. The non-secret bundle was generated with
   `npm run governance:prepare-production-exclusive-db-sql`. Review the SQL
   and hashes below. `00-create-empty.sql` ran on `defaultdb` as `doadmin`,
   then `01-bootstrap.sql` and `04-verify-exclusive.sql` ran on the new
   `governance_prod` database. The three new roles remain `NOLOGIN` until
   separate protected production credentials are provisioned.
   Files `02` and `03` are post-migration grants for Step 4, not Step 3.
5. Restrict DigitalOcean trusted sources to the reviewed Contabo production
   app endpoint and operator access once its service is staged. Record the actual
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
applied to this exclusive-cluster topology. The production-only bundle changed
the DigitalOcean cluster as recorded above. Production migrations and the
post-migration grants have not yet been applied.

## Rollback and limits

Before retirement, the managed `governance_test` database is a rollback copy.
After retirement, recovery of synthetic pilot data uses the independently
authenticated Contabo/B2 backup and closed restore process. Recreating the
DigitalOcean copy would be a new reviewed change. Creating an empty production
database does not admit users or traffic. Production backups, app deployment,
WorkOS callbacks, chain selection, replacement-cluster recovery, and capacity
acceptance are later gates.
