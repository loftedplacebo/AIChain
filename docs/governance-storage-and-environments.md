# Governance storage and environment foundation — 2026-09-27

> Current baseline — 28 September 2026: [Platform current state](platform-architecture.md) supersedes dated implementation and launch-status statements below. The synthetic 24-hour reliability run has concluded; it is not a production capacity claim. Production identity, operations and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

## Local launcher environment guards — 28 September 2026

### Persistent local shared PostgreSQL development

`scripts/governance-postgres-dev.cjs` provides `init`, `start`, `provision`, `status` and `stop` for a dedicated Windows development cluster at `build/governance/dev/postgres`, listening only on `127.0.0.1:55440`. It uses the existing portable PostgreSQL binaries. This is separate from the synthetic-only cluster on 55439. Run lifecycle commands as the intended normal Windows operator; PostgreSQL cannot start under the sandbox restricted token. The directory uses private operator ACLs; if initialization occurred under a sandbox identity, grant only the intended operator access before starting. Do not broaden access to Everyone or Users.

For a fresh cluster, run `node scripts/governance-postgres-dev.cjs init`, then `start`, then `provision`. Provisioning creates distinct non-owner API and evidence-worker logins, applies all reviewed migrations with the `dev` marker and verifies both runtime profiles. Existing roles/database/credential files are never replaced. Failures retain private state for manual reconciliation; there is no automatic cleanup or retry of partial provisioning. Never print or commit `access.json`, `runtime-access.json` or `identity-seal.key`.

After provisioning, `node scripts/governance-shared-dev.cjs` starts the loopback API on port 8798 with PostgreSQL events, customer control and keys. It imports only the provider client/key/callback from the existing private `build/governance/dev/workos.env`, generates a separate local sealing key and does not import SQLite data, seeded users, project credentials or wallet keys. The existing callback is currently `http://localhost:3001/api/auth/callback`; a browser test must use that matching portal origin and route its server-side API gateway to `http://127.0.0.1:8798`. No website environment was changed in this preparation. Changing storage invalidates the usefulness of earlier browser sessions; sign in afresh. Provider configuration still uses the existing WorkOS environment; this is not independent hosted environment separation or MFA acceptance.

29 September acceptance: strict API/worker profile checks pass; actual API requests return 200 for `/health` and `/ready` and 401 for unauthenticated `/v1/session`. Aggregate secret-free evidence is in `build/governance/dev/postgres/startup-validation.json` and `provisioned.json`. API and cluster were stopped after validation. Real customer sign-in, renewal, key lifecycle, membership and receipt/worker/Base acceptance on this fresh database remain next steps. No worker is started by these commands. Stop the API with Ctrl+C, then run `node scripts/governance-postgres-dev.cjs stop` after use. Hosted release gates remain enforced.

The generic governance service launcher accepts `dev` and `test` for serving.
It recognises `staging` and `prod` but refuses startup while managed identity and
operational release evidence are incomplete. There is no flag to bypass that gate.
Default event/session paths live under `build/governance/<environment>/` relative
to the repository root, independent of the terminal's working directory. Explicit
relative paths are now also repository-relative; check older launcher configurations
before restarting. The network listener remains loopback-only.

SQLite files opened by this launcher receive a persistent environment marker,
including the separate session/control-plane file used with PostgreSQL and optional
rule/delivery journal. Reopening a file under another environment fails, even when
adoption is enabled. PostgreSQL retains its existing migration/environment/RLS
checks; staging/production migrations are not enabled by this change.

An existing SQLite file without a marker is refused by default. Before adopting:
stop writers, take a consistent backup, verify the intended environment and exact
configured paths, then use `GOVERNANCE_ADOPT_UNBOUND_SQLITE=true` for one reviewed
dev/test startup. Remove the flag after adoption. Adoption labels existing data;
it does not copy, scrub, migrate or authorise use of customer data. A mismatch
requires a separate correct database, not changing the marker. In-memory test
databases are transient and cannot provide persistent isolation evidence.

Three local tests cover defaults/hosted gates, marker persistence/mismatch without
data changes, and explicit legacy adoption plus real launcher startup. The dedicated
VPS launcher, workers, indexer, relayer secrets, provider environments and backup
destinations still require their own reviewed isolation/deployment work. No live
VPS files were adopted or restarted. PF-01 remains partially complete.

## Four-environment deployment plan and release sequence — 29 September

Review the non-secret
[`deployment-plan.example.json`](../deploy/governance/deployment-plan.example.json)
with `npm run governance:review-deployment-plan -- <plan.json>`.
The example contains reserved `.example.test` hosts, dummy addresses, replacement
provider/secret references and illustrative recovery objectives. It is not a
provisioned environment or an agreed RPO/RTO. Keep actual credential values in the
protected secret store; put only inventory references in this plan. Use a reviewed
private copy for real infrastructure identifiers. The checker reads at most 64 KiB,
prints only validation errors/status, opens no network connection and makes no
configuration or database changes. A valid result always has `releaseReady:false`.

The schema requires dev, test, staging and prod, each with a distinct database,
provider environment/client, callback/webhook URL, credential references, recording/
relayer addresses, worker journal and backup destination. API, worker and migration
roles must differ within a database. Hosted profiles require verified PostgreSQL
TLS, HTTPS identity endpoints and independent backup storage. Every profile declares
retention and RPO/RTO targets. These are declared constraints: different references
can still resolve to the same secret, hosts can be aliases, and separate backup
prefixes may share a failure domain. Independent provisioning review must check
actual resources, access policies, key material and restore results. The validator
does not prove any of those properties. No existing secret files are imported.

Recommended release sequence:

1. Select the database/backup hosting layout and agree recovery objectives. Record
   operators and ownership for identity, database, app, evidence publication and
   recovery; inventory protected secret references and failure domains. Prepare
   all four profiles without copying customer data or signing keys between them.
2. Provision an isolated test database and provider configuration. Apply reviewed
   migrations with the migration owner, then the separate API/worker grants. Check
   native TLS, forced RLS, strict profiles and environment binding with actual
   runtime credentials. Migration credentials must not be available to the API.
3. Exercise hosted sign-up/email verification, sign-in, renewal, logout, active
   reauthentication, invitations, owner/admin limits, key lifecycle and the first
   structured submission in the shared PostgreSQL mode. Configure the signed
   WorkOS revocation endpoint, then test real delivery, duplicate delivery and
   delayed/missed-event handling. Confirm MFA/recovery and IdP policies with the
   provider rather than inferring MFA from `auth_time`.
4. Run one explicitly bounded evidence cycle with isolated testnet keys: inspect
   the signed receipt, batch membership and Base verification in the portal.
   Review journal recovery, pending/uncertain publication and delivery handling.
   Establish encrypted off-host backup schedules/retention, alerts and an isolated
   restore drill. Reconcile post-backup permissions/owners and pending journals;
   never automatically reactivate backed-up identities or memberships.
5. Record readiness/resource/backlog monitoring, secret custody/rotation, incident
   ownership, release/rollback procedures and acceptance evidence tied to the
   exact application revision and migration checksums. Application rollback must
   be compatible with the current schema; destructive schema reversal or restoring
   over live data is not an automatic rollback strategy.
6. Review the evidence and explicitly implement the staging release gate before
   any hosted exposure. Staging then rehearses the complete deployment and rollback
   with synthetic data. Production requires its own provider/database/keys/backup
   custody and separate approval; a successful staging run is not production consent.

Both hosted runtime stages remain hard-gated in code. This plan does not override
those gates or authorise spending, deployments, provider changes, public exposure,
mainnet publication or scheduled work. The pending infrastructure decision does
not prevent further local implementation. Seven deployment/environment checks
passed, including topology sharing rejection and preservation of hosted startup gates.

## Standalone validation update

### PostgreSQL transport configuration — 29 September

The API launcher, PostgreSQL evidence worker and migration CLI now share explicit
connection parsing. `GOVERNANCE_DATABASE_URL` (or `GOVERNANCE_MIGRATION_URL`) must
be a postgres/postgresql URL with host, database, username and password. Percent-
encoded credentials are decoded once. URL query parameters other than one
`sslmode` are rejected; they cannot override the host, credentials, SSL options or
load client-key files. Accepted modes are `verify-full`, or `disable` only on
localhost/127.0.0.1/::1. `require`, `prefer`, `verify-ca` and `no-verify` are rejected.

Non-loopback connections always require TLS with a trusted certificate chain and
the configured DNS hostname/IP SAN. The optional `GOVERNANCE_DATABASE_CA_FILE`
loads a regular non-symlink CA certificate file (at most 1 MiB, no private-key
material). It also requests TLS for loopback. Without that setting, system trust
is used for remote TLS, while local synthetic loopback permits plaintext. Explicit
pg options prevent a connection string or ambient `PGSSLMODE` from replacing this
TLS policy. No insecure retry or plaintext fallback occurs. Provider-specific URL
options and mutual-TLS client certificates are not supported by this configuration;
review requirements rather than adding bypass flags.

Six connection/environment tests passed. Actual local TLS handshakes accept a
trusted matching certificate and reject untrusted, DNS-mismatched and IP-mismatched
certificates. Native shared-session/HTTP acceptance passed nineteen groups in
`build/postgres-native/s32ab7782db7c/results.json` using the synthetic loopback
database. These checks prove parser/client/TLS behavior and local launcher
compatibility, not a managed PostgreSQL TLS/failover acceptance test. Hosted
startup gates remain unchanged. Backup/restore tools remain separately restricted
to their explicit local operator configuration; no hosted backups were enabled.

Shared-key update, 28 September: the generic dev/test launcher additionally accepts
`GOVERNANCE_KEY_STORAGE=postgres` only with PostgreSQL event storage. Migration 006
and explicit optional key-runtime grants are required. Native two-pool acceptance
passed nine checks for creation/retry/rotation/revocation, lock-wait authentication,
project limits, rollback, isolation, privilege guards and HTTP integration. See the
[implementation and selection procedure](../services/governance/README.md#shared-postgresql-api-keys--28-september-2026).
The SQLite session file still holds identities, memberships, sessions and OAuth
flows. Shared keys do not complete production control-plane migration. SQLite
backup tooling cannot cover PostgreSQL keys or revoke them after a PG restore.

The native PostgreSQL concurrency, authenticated API, backup/restore and clean
restart checks have now passed. See [standalone validation evidence](governance-postgres-native-validation.md).
The embedded-only limitation below records the earlier stage; production
operations and sustained load remain outstanding.

## Product purpose and delivered increment

The governance workspace must reconstruct structured decisions, outcomes and
control observations over time, without hosting customer source conversations,
documents or media. This increment adds a PostgreSQL event-store adapter behind
the existing API. The authenticated portal's data contract is unchanged.
SQLite is the deployed synthetic VPS store. A native PostgreSQL test instance was provisioned and validated locally; no production PostgreSQL migration has occurred.

Delivered: versioned/checksummed migrations; transactional event, outbox and
usage writes; scoped reads/search/reports; PostgreSQL row-level security;
per-project event/storage/daily limits; database environment binding; explicit
driver selection; and PostgreSQL-engine acceptance tests.

## Consistency and access

Each operation checks out one database connection, starts a transaction, sets
transaction-local tenant/project context, and commits or rolls back before
returning the connection. Reads use repeatable-read snapshots. Reports join
later adjudications within the same snapshot and tenant/project boundary.
The existing 10,000-event report ceiling remains; a large window fails clearly.

RLS is enabled and forced on events, outbox and usage. Missing context exposes
no rows. Application predicates remain as an additional check. Run migrations
using a separate owner; use a non-owner runtime role with only the grants in
the selected profile described below. Runtime startup rejects
superuser and BYPASSRLS credentials. The runtime role must not own the database
or gain owner/migration rights through role membership.

Concurrent acceptance is serialized per tenant/project by the usage-row lock.
Identical retries return success without incrementing counts; changed event
IDs or stream sequence collisions return 409. A failed outbox write rolls back
both the event and its counters. No successful HTTP acceptance is returned
until commit. Retry timeouts using the same event ID.

Defaults are local/pilot guardrails, **not paid plan allowances**:

| Setting | Default | Meaning |
|---|---:|---|
| GOVERNANCE_MAX_EVENTS | 100,000 | Retained events per tenant/project |
| GOVERNANCE_MAX_BYTES | 268,435,456 | Serialized accepted UTF-8 event bytes |
| GOVERNANCE_MAX_DAILY_EVENTS | 50,000 | New accepted events per UTC receipt day |

These apply to the PostgreSQL adapter. SQLite remains a development adapter
without these quotas. Stored-byte accounting excludes PostgreSQL indexes,
WAL, replicas and backups; it is not a physical-disk limit. Capacity alerts and
infrastructure budgets remain required. Identical retries do not consume an
allowance. Quota rejections return 429 without an event/outbox side effect.
Configure identical limits on every service instance before multi-host use.

## Migration and service setup

Use a new dedicated database; do not point migration tooling at an existing
shared or production database. Provision separate migration and runtime roles.
Connection strings are environment secrets, never committed files or browser
configuration. Use verified TLS for non-local PostgreSQL connections; no
certificate-validation bypass is introduced.

1. Set `GOVERNANCE_ENV=dev` or `test` and `GOVERNANCE_MIGRATION_URL` for the
   migration owner. Run `npm run governance:migrate`. The runner takes an
   advisory transaction lock, validates applied checksums, and applies pending
   changes atomically. Unknown/changed migration history fails closed.
2. Grant the reviewed runtime permissions. Set `GOVERNANCE_STORAGE=postgres`,
   `GOVERNANCE_DATABASE_URL` for the runtime role, and the same environment.
3. Configure the existing user memberships and ingestion credentials. Set
   `GOVERNANCE_SESSION_DB` to a private persistent local path.
4. Start `npm run governance:serve`. Startup checks migration history, database
   environment and runtime privilege. No automatic migration is run at startup.
5. Point the website's server-side `GOVERNANCE_API_URL` at that service; the
   browser continues using its same-origin workspace gateway.

The development session store is deliberately still SQLite. This is a
**single-service pilot topology**, not a multi-instance production identity
system. Managed identity and shared/revocable session infrastructure are still
required before production. Do not run multiple web-facing service instances
with unrelated session databases. Production startup is currently gated.

The standard SQLite service now defaults to `build/governance/dev/events.sqlite`
(or the test equivalent). If preserving a previous local database, explicitly
set `GOVERNANCE_DB` to its existing path. The isolated workspace launcher keeps
its original database path and is unaffected. There is no silent SQLite-to-PG
import: a future import must preserve event IDs, original receipt timestamps,
digests and outbox status, reconcile row counts, and validate reports before
switching. Ingestion is not a historical import tool because it sets receivedAt.

## Environment rollout, when ready

| Environment | Purpose | Isolation requirements |
|---|---|---|
| Dev | Local synthetic development | Disposable data, local accounts; no production keys |
| Test/staging | Release acceptance, restore rehearsal and capacity tests | Separate database, credentials, domain, queues, session store and Base Sepolia publisher |
| Prod | Real customer governance | Separate infrastructure and keys, approved residency, managed identity, private DB access and operational ownership |

The migration runner binds each new database to dev or test. Startup rejects a
mismatch; do not relabel an existing database to repurpose it. Production
provisioning is deferred, not simulated by a variable change. Tenant-provided
event `environment` values are analytical dimensions, not deployment isolation.
Use one release artifact promoted through environments with separate secrets.
No automatic CI/CD or infrastructure changes were introduced in this increment.

## Retention and backups: explicit next gates

No automatic deletion or recurring backup schedule is enabled yet. Before real
customer onboarding, agree retention per workspace, deletion/legal-hold rules,
backup retention, residency, recovery-point and recovery-time objectives.
Pending anchoring/reconciliation records must not be pruned accidentally.
Removing records requires usage-counter reconciliation and an idempotency
tombstone policy; simply deleting old rows could allow old events to be accepted
and billed again. Public commitments cannot restore deleted off-chain evidence.

Recommended first operational implementation: encrypted daily backups with a
separate access-controlled destination, then WAL/PITR when the agreed recovery
objective requires it. Exact schedules and retention await those decisions.
Do not call a backup complete until a restore into an **isolated test database**
has been checked for migrations, tenant isolation, event/outbox counts, counters,
sample digests and reconstructed reports. Never restore over a live database.
Restoring a production-labelled database requires a dedicated recovery workflow
that cannot accidentally start against live publishers or customer endpoints.
The local session store is separate: recovery should revoke sessions rather
than quietly resurrect old logins. Signing/wallet keys need a separate recovery
policy and must not be bundled casually with database exports.

## Validation and remaining evidence

### Read-only backup-set monitoring — 29 September

`node scripts/governance-postgres-recovery.cjs monitor <private-config.json>`
accepts `environment`, absolute `root`, `keyFile`, optional `maxAgeHours` (1–720),
`requiredJournalRoles` (worker/rules/indexer/relayer), and `maxArchives` (1–64;
default 32). The [example](../deploy/governance/monitor-backups.example.json) is
a dev planning path; adapt it to the actual capture root, protected backup key and
all journal roles used by that installation. This operation remains dev/test only.

Role names describe authenticated **SQLite** archive entries, not every runtime format. The deployed Base index uses disposable JSON, and the older capped-relayer prototype uses a JSON budget ledger; neither is captured by labelling a SQLite entry `indexer` or `relayer`. Inventory actual components and formats before claiming backup coverage. The active governance publisher uses the `worker` SQLite journal; see [publisher inventory and separate JSON limitations](restored-worker-journal-review.md#publisher-inventory-older-capped-relayer-prototype).

The capture root must be a dedicated regular directory. The monitor authenticates
each complete encrypted archive and its coordinated journals, selecting the latest
by authenticated capture time. It returns exit 0 only when that capture is fresh,
contains every required journal, and the inventory has no invalid/incomplete
capture or unexpected entry. Missing/stale/invalid/over-limit inventory, omitted
journals and invalid configuration return nonzero (policy failures exit 2).
It does not fall back to an older journal-complete bundle. Output contains aggregate
status and capture metadata, not passwords, keys, record bodies or archive paths.

Monitoring decrypts full archives into temporary protected scratch storage, which
is cleaned on normal completion. Run it as an offline operator job with sufficient
disk/time and restricted backup-key access, not a frequent public health endpoint.
Avoid overlap with capture jobs: an unfinished capture deliberately reports an
error. Use a separate retention procedure so the inventory stays within its bound;
this tool never deletes backups, rotates keys or installs a scheduler. A valid
archive is not proof that restoration, off-host availability or RPO/RTO has passed.
The local hourly freshness granularity does not satisfy an agreed sub-hour RPO.

Fourteen native recovery groups passed in
`build/postgres-native/rffd4f0b9b8fa/results.json`, including actual PG/journal
monitoring, stale/wrong-key/missing-role rejection, unchanged archive/database
inventory, CLI success/nonzero policy exits and source-absent gated restore.
Two monitor regression tests cover missing/incomplete/unexpected/over-limit
inventory and newest-capture selection. No scheduler or hosted backup was enabled.

## Shared API project budgets

Migration `016-project-request-limits.sql` adds two reusable fixed-minute windows per tenant/project. The shared PostgreSQL control launcher installs `PostgresRequestLimits` for all requests after project authentication, before project routes/body handling. Concurrent API processes and different keys share one atomic counter; read and write budgets remain independent. This supplements local connection/upload/in-flight controls and existing storage/daily-event quotas. [Configuration and behavior](../services/governance/README.md#shared-project-request-limits).

The API grant template now includes scoped SELECT/INSERT/UPDATE on the forced-RLS table; the worker receives none. Update reviewed migration and role grants together. Policy disagreement or backwards time refuses traffic rather than resetting the window. The bounded operational counters are not signed governance evidence, billing records or credential history. There are no per-request rows to prune; deployment still needs project-lifecycle archival/cleanup policy.

Migration `018-customer-request-limits.sql` adds a separate forced-RLS read/write window per verified customer across API processes, app sessions and workspace selection. The shared-control launcher installs it after authentication and before account, workspace, key and project routes; project sessions must pass both customer and project budgets. Defaults are 300 reads/60 other requests per minute, configured identically using `GOVERNANCE_CUSTOMER_READ_REQUESTS_PER_MINUTE` and `GOVERNANCE_CUSTOMER_WRITE_REQUESTS_PER_MINUTE`. Rejected operations receive 429 and retry guidance; the portal preserves the session and does not automatically replay mutations. Apply updated strict API grants with the reviewed migration. [Scope and configuration](../services/governance/README.md#shared-verified-customer-request-limits).

Migration 019 adds a shared configured-client sign-in start window before encrypted PKCE flow creation. The shared-control launcher installs it automatically, with default 120 starts/minute and `GOVERNANCE_AUTH_START_REQUESTS_PER_MINUTE` consistent across processes. Sign-in/signup/reauthentication share the window; existing callbacks and sign-out are unaffected. This is an aggregate capacity fuse, which can delay legitimate new starts when exhausted, not per-IP bot identification. [Configuration and exclusions](../services/governance/README.md#shared-sign-in-start-capacity).

Other pre-authentication/provider endpoints, authentication lookup/renewal and Internet-edge traffic still need separate abuse controls; sign-out intentionally remains available at the limit. Hosted saturation, multi-host acceptance, clock synchronization and consumption-plan policy remain release requirements; no public service is enabled.

## Backup encryption-key rotation

The offline dev/test `rotate-key` operation re-encrypts one authenticated coordinated PostgreSQL/journal archive into a fresh private directory with a distinct replacement key. It preserves capture identity, original creation time, the PG dump and exact journal snapshot plaintext. All ciphertext receives fresh AES-GCM IVs; the nested manifests and outer encrypted journal-file hashes are rebuilt as required. The encrypted outer manifest records rotation time and source encrypted-manifest digest. Rotation is not a fresh capture, and an old archive stays stale.

Use [the private configuration example](../deploy/governance/backup-key-rotation.example.json), replacing its paths. Both key files must contain separate 32-byte lowercase hex keys. The CLI accepts bounded regular private files, keeps keys out of output/arguments and clears its key buffers after use. On Windows, protect operator configuration/key directories with restrictive ACLs; the existing backup utility creates private scratch/output directories. Never put real keys in the example or source control.

```powershell
node scripts/governance-postgres-recovery.cjs rotate-key C:/AIChain/build/private-keys/rotation.json
```

No database connection, native PostgreSQL binary, live service or quiescence change is needed for this archive operation. Source archives must be stable and independently protected. The utility authenticates the original archive, decrypts into bounded private scratch files, re-encrypts into a fresh `pg-backup-` directory, authenticates the candidate with the new key, and checks the source inventory/digests again before success. Plaintext scratch and failed candidate directories are removed. Output within the source archive, identical keys, malformed/tampered archives and unexpected/symlinked inventory are refused. This is drift detection rather than an atomic lock across arbitrary concurrent filesystem writers.

The original archive and old key remain usable; rotation cannot revoke copies held elsewhere. Keep different key generations in separate monitored roots because the current monitor accepts one key per root. Retiring an old key/archive requires independent custody/retention review and a successful restore with the replacement, including off-host copies. The utility performs no deletion of originals, key generation, escrow, scheduler installation or off-host transfer. These remain hosted operational requirements.

Native recovery acceptance covers PG plus worker/rule journals, unchanged source bytes/time, old/wrong-key denial, nested-output refusal, a private CLI round trip without key output and actual new-key restore with evidence preserved and access gated. See [native validation](governance-postgres-native-validation.md).

The shared-control API uses
[`postgres-api-grants.sql`](../deploy/governance/postgres-api-grants.sql); the
PostgreSQL worker uses
[`postgres-evidence-worker-grants.sql`](../deploy/governance/postgres-evidence-worker-grants.sql).
Apply reviewed migrations as a separate owner, then provision fresh non-owner
login roles and protected credentials separately. These grant-only templates do
not remove existing grants: startup will reject an overprivileged role. Do not
reuse the API credential for the worker. Older event/key grant examples serve the
mixed-storage pilot only and cannot satisfy the full API profile.

The API can ingest events, manage customers/sessions/scoped keys and read evidence;
it cannot write evidence, rewrite worker outbox status, delete events or update
action history. The worker reads scoped events and writes evidence/outbox status;
it cannot ingest events or read customer/session/key tables. Some UPDATE grants
are required for row locks as well as mutations. Both profiles reject ownership,
other-role membership, persistent public-schema/database creation, privileged
role flags, incomplete or excessive table/column privileges, and missing forced
RLS. The API readiness probe repeats profile checks within its bounded read-only
transaction; successful readiness may be cached for one second. Customer-only
recovery at `customer-active` permits
API/pilot readiness while evidence-worker readiness remains not-ready; pending
recovery states refuse both. This matches repository and publisher authorization.
The profile separates trusted server access; it is not an SQL interface for
customers or proof of hosted
security. Temporary-table privileges are not prohibited by this profile.

The launcher automatically selects `api` for shared PostgreSQL control storage;
the PostgreSQL worker automatically selects `evidence-worker`. Mixed control
storage stays `pilot`. Existing PostgreSQL worker deployments with broad pilot
credentials need reviewed separate role provisioning before using this version.
No live role migration, worker restart or staging/production activation occurred.

The test suite runs migration SQL and adapter operations in PGlite's embedded
PostgreSQL engine, including a restricted role and real RLS. It is not a mock
SQL parser. Tests cover atomicity, duplicate handling, quota rollback, scoped
search/reports, delayed labels, environment mismatch, migration tampering and
HTTP response behavior. Existing SQLite/workspace regression tests also run.

Migration 014 adds a private customer-recovery activation audit and the
`customer-active` gate. No runtime grants are added: API and worker profiles must
have no access to this operator audit. Customer access can be reopened separately
from publishing only through the reviewed offline dev/test
[activation workflow](recovery-access-review.md#customer-only-activation).
Strict evidence-worker startup/transactions and the governance worker's publisher
checks refuse that gate. Hosted release and independent external reconciliation remain separate
requirements.

Native PostgreSQL is now available as an isolated, synthetic loopback test cluster.
Native two-pool acceptance, mixed ingestion/dashboard testing and encrypted
coordinated restore drills are recorded in
[native validation](governance-postgres-native-validation.md). Those local drills
do not prove hosted TLS, failover, off-host backup custody or production throughput.
PGlite remains useful for adapter regression checks, not those operational claims.
Hosted staging validation and the longer workload remain deployment gates; do not
extrapolate embedded test timing or the local mixed run into capacity guarantees.

References: [PostgreSQL row security](https://www.postgresql.org/docs/17/ddl-rowsecurity.html)
and [node-postgres connection pooling](https://node-postgres.com/apis/pool).

Validation record: the combined service, PostgreSQL, session, event-schema and
receipt suites passed 38 tests. Standard service startup was also exercised on
a temporary loopback port with an in-memory SQLite database (health HTTP 200).
