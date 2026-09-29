# Operations runbook

Reviewed 27 September 2026. This is the operational entry point for the private synthetic Base Sepolia pilot. Detailed procedures below remain supporting references. This page is not a live health monitor.

## Current deployment and ownership

The supervised VPS API and worker share the synthetic SQLite store. API access is loopback-only, through an SSH tunnel from the local website (local 8794 to VPS 8795). The website is not publicly connected to a production customer API. Base Sepolia chain ID is 84532.

One publisher wallet, one journal and one active worker owner are required. Wallet ownership has moved to the VPS; the local launcher is disabled. The API loads no signing keys but shares the SQLite OS account with the worker; this is not production credential isolation. Keep secrets in ignored/private configuration, never documentation.

## Operator procedures

The local reporting increment requires PostgreSQL migration 005 before serving
new code. Its generated columns/indexes can lock or rewrite the event table:
back up, reserve a maintenance window, apply with the migration role, refresh
`ANALYZE governance_events`, and verify scoped reports before opening traffic.
After large imports refresh statistics again; keep native autoanalyze enabled.
VPS rollout and native load validation remain pending. See the
[reporting contract](developer-guide.md#database-reporting-increment-27-september-2026).

For on-demand synthetic submission tests, use the
[local capacity harness](developer-guide.md#submission-capacity-harness-local-27-september-2026).
It cannot target the deployed VPS and does not alter the existing soak or fee
policy. Plan a separate isolated test environment before high-volume VPS runs;
do not point synthetic stress traffic at a live customer workspace.

| Need | Procedure |
|---|---|
| Restore the portal connection or check the soak | [VPS portal, tunnel and soak](governance-vps-portal-and-soak.md) |
| Deploy, restart or recover worker ownership | [Supervised VPS worker](vps-governance-worker.md) |
| Interpret queues, limits and transaction recovery | [Automated worker](governance-automated-worker.md) |
| Diagnose receipt or confirmation state | [Evidence integration](governance-receipt-base-integration.md) |
| Operate the durable public event indexer | [VPS Base indexer](vps-base-sepolia-avr-indexer.md) |
| Operate earlier synthetic ingress | [VPS synthetic ingress](vps-base-sepolia-synthetic-ingress.md) |
| Plan PostgreSQL migration and permissions | [Storage and environments](governance-storage-and-environments.md) |
| Review native database recovery evidence | [PostgreSQL validation](governance-postgres-native-validation.md) |

## Managed identity acceptance before hosted customer access

Read the actual WorkOS environment settings before changing policy. On 29 September,
the connected Staging environment still reported required email verification,
password sign-in enabled and `mfaEnabled: Off`. Production was not changed.
Required MFA is the recommended release policy; operator enrolment is pending.

Validate hosted enrolment and subsequent sign-in using an authenticator app,
rejection of incorrect codes, recent-sign-in prompts on key/member changes,
logout and the approved account-recovery procedure. Record outcomes without
recording passwords, authenticator enrolment secrets, recovery material or tokens.
Then repeat the customer workspace/key workflow in shared PostgreSQL mode.

Hosted AuthKit uses TOTP and handles enrolment; its required-MFA setting excludes
SSO users. SSO adoption therefore needs an explicit upstream IdP MFA policy and
acceptance, rather than treating a recent `auth_time` as factor evidence. See
[WorkOS MFA](https://workos.com/docs/authkit/mfa). Password/MFA reset or a lost
factor must not automatically transfer workspace ownership to a new subject.
No credential reset, new-user email or account ownership change is authorised by
a successful local readiness probe.

## Runtime liveness and storage readiness

For the generic dev/test API, use `GET /health` for process liveness and
`GET /ready` for dependency readiness. Readiness returns 200 `ready` only when
configured event/control/key storage and any rules journal are accessible, bound
to the expected environment and outside a recovery gate. PostgreSQL migration
checksums are checked in a read-only transaction. Failure returns 503 `not-ready`
without database details. A server with no configured probe returns 503.

Probe at intervals of at least five seconds. A successful result can be cached
for one second; PostgreSQL waits return not-ready after 1.5 seconds and share one
pending operation rather than building a pool queue. SQLite metadata reads are
synchronous and inherit their connection busy timeout. During controlled shutdown,
readiness is withdrawn before processors/connections stop. Investigate storage
access, migration history, environment binding and recovery status after repeated
failures; do not clear a recovery gate merely to make the probe pass.

The endpoint does not verify provider reachability, receipt publication, chain
confirmations, backup freshness or the approved production release. Those require
separate monitoring. This increment is local-only; existing VPS launchers have not
been wired or redeployed. Native lock/gate/environment checks passed in
`build/postgres-native/s64e8a7017ab8/results.json`.

## Reliability acceptance

The scheduled soak runs from 27 September 2026 13:29:31 UTC to 28 September 13:29:31 UTC, at 100 synthetic events/hour and at most 2,400. Its last documented initial checkpoint was 100 accepted with zero errors; completion has not been reconciled. Read persisted timestamps and the actual report before changing its status.

A completed submission schedule is not a passed evidence test. Reconcile accepted events, signed receipts, membership proofs, jobs, canonical anchors, duplicate attempts, errors and fees. Preserve the final dated report in validation/ and update the roadmap. Do not infer million-per-day capacity from this run.

The current worker reserves a conservative rolling 24-hour budget of 0.001 test ETH, permits 10 new transactions/hour and caps configured gas price at 0.1 gwei. L1 fee allowances are planning estimates, not a protocol-enforced total-cost ceiling.

## Production gates

Before real customer data or paid access: separate dev/test/prod credentials and stores; production identity and roles; managed keys; PostgreSQL rollout; encrypted scheduled backups with independent restore drills; retention/deletion policy; observability and incident response; quotas and cost measurements. Local PostgreSQL backup/restore validation does not mean scheduled production backups exist. See the [roadmap](roadmap-and-decisions.md).

## Encrypted coordinated local recovery

The dev/test PostgreSQL recovery CLI now captures a native custom-format dump plus
optional worker/rules/indexer/relayer SQLite journals under one authenticated,
encrypted manifest. It does not deploy a scheduler or activate a restored service.
Use only an isolated loopback deployment. Stop all APIs, publishers, delivery and
migration processes before acknowledging `quiesced`; the utility additionally holds
SHARE locks on public PG tables during dump and journal capture. This is not an
online backup or production availability claim.

Keep the database connection JSON and separate 64-character lowercase hex backup
key in private files outside Git. The connection file contains exactly `host`,
`port`, `database`, `user`, `password`; local dev/test operation currently uses an
offline database administrator. Do not place passwords in commands, logs or chat.
Keep backup key custody separate from backup bundles; the tool never creates or
exports an operator's backup key. Official `pg_dump`/`pg_restore` binaries are
required. Native commands have a two-minute timeout; each dump/journal is limited
to 512 MiB. Plaintext scratch directories are private and cleaned after use.

Backup configuration example (paths are illustrative):

```json
{
  "environment": "test",
  "connectionFile": "C:/AIChain/build/governance/test/recovery/source-connection.json",
  "binaries": "C:/AIChain/build/postgres-runtime/pgsql/bin",
  "journals": [
    {"role": "worker", "path": "C:/AIChain/build/governance/test/worker.sqlite"},
    {"role": "rules", "path": "C:/AIChain/build/governance/test/rules.sqlite"}
  ],
  "outputRoot": "C:/AIChain/build/governance/test/backups",
  "keyFile": "C:/AIChain/build/governance/test/recovery/backup.key",
  "consistency": "quiesced"
}
```

Run `node scripts/governance-postgres-recovery.cjs backup private-backup.json`.
Persist the returned completed directory as one unit: `postgres.gcm`,
`manifest.gcm`, `complete.json` and, when included, the `journals` subdirectory.
Do not treat a partial directory or missing completion marker as a valid backup.
Encryption does not replace retention, off-host storage or independent restore drills.

Restore configuration uses `environment`, `connectionFile`, `binaries`, `directory`,
`outputRoot`, `keyFile`, `targetDatabase`. `directory` selects the completed backup.
The connection file must select maintenance database `postgres`; target names must
begin `gov_restore_` and must not exist or equal the archive's source name.
Authenticated archives can now restore without the original source database.
The local dev/test acceptance preserves its synthetic source under another name;
it does not overwrite databases or migrate a live customer. An independent-host
drill and hosted recovery configuration remain unfinished.
Run `node scripts/governance-postgres-recovery.cjs restore private-restore.json`.

Every encrypted component is authenticated before target creation. PostgreSQL is
restored without owners/ACLs and its shared sessions/flows are removed, keys and
invitations revoked, identities disabled/versioned and gate set to review required.
SQLite journals retain pending transaction/delivery bytes and receive their own
activation gates. An error leaves any newly created database offline; inspect the
specific destination as an operator rather than reusing it on the next attempt.

Review configuration uses `environment`, `connectionFile`, `binaries`, `directory`.
Select the returned restore directory and a connection file pointing to that exact
restored target. Run `node scripts/governance-postgres-recovery.cjs review
private-review.json`. Passing review is read-only and never activates identities,
API services, publishers or deliveries. Owner recovery, fresh credentials, nonce
reconciliation and explicit approved activation are still required. Never replay a
restored signed transaction automatically or use a restored publisher wallet on
two hosts.

Repeatable synthetic acceptance: `node scripts/test-governance-postgres-recovery-native.cjs`
with the dedicated cluster running. Eleven recovery groups passed; evidence is
`build/postgres-native/rd9ae78b6ccd1/results.json`. Off-host schedules, retention/PITR,
custody/rotation and alerting remain production gates.

### Non-activating backup integrity and freshness inspection

Run `node scripts/governance-postgres-recovery.cjs inspect private-inspect.json`.
Its private configuration contains `environment`, completed archive `directory`,
`keyFile` and optional `maxAgeHours` (1–720, default 24). It needs no database
connection or PostgreSQL binary path. The command verifies the encrypted manifest,
dump and journals in private temporary storage, checks authenticated timestamps,
and cleans temporary plaintext. The archive remains unchanged and no database,
credential or service is created or activated.

Exit codes are 0 for verified/fresh, 2 for verified/stale and 1 for failure. A
completion marker alone is insufficient. A future or changed timestamp fails;
the freshness clock allows at most five minutes of future clock skew. Monitor
failure/staleness at the backup schedule boundary using an agreed recovery point
objective. No monitoring schedule or outbound alert has been installed. Inspection
performs substantial disk I/O; run it as an operator task rather than a customer
request. It establishes archive integrity, not successful native restoration,
off-host custody, retention compliance or approved recovery activation.
