# Standalone PostgreSQL acceptance — 2026-09-27

Migration-019 acceptance: strict-role run `p828b089b1ce8` passes 12 groups,
shared-session/launcher run `s823b631a7f19` passes 27 and encrypted recovery
run `r8dbf26da8666` passes 35 through the new schema. Independent pools admit
exactly 20 of 40 configured-client sign-in starts, isolate other clients under
forced RLS, deny worker/unscoped access and refuse policy/clock drift. Two actual
loopback shared-control servers enforce one allowance and create no denied
flow; an admitted single-use callback remains consumable. The WorkOS suite
passes 38 tests, including complete callback acceptance after exhaustion using
a synthetic signed provider response. Service regression passes 17 tests; the
website build and 40 tests pass, including retry guidance and retained flow
cookies with no automatic redirect/retry. This is aggregate local capacity
acceptance, not public-edge/bot/MFA protection or live provider/hosted acceptance.

29 September migration-018 acceptance: strict-role run `p47350c0eba7c` passes
11 groups, shared-session/launcher run `s8ae25675de73` passes 26 and encrypted
recovery run `r52bf2ce587c3` passes 35 through the new schema. Independent API
pools admit exactly 20 of 40 concurrent customer reads, isolate other actors and
write windows under forced RLS, and refuse policy/clock disagreement. Two real
loopback HTTP servers with separate sessions share a customer's pre-project
budget, preserve sign-out/health access and create no denied workspace. The
launcher validates settings and installs persistent customer counters before
session/workspace/key routes. Seventeen service tests and the website build
with 39 tests pass; bounded retry guidance preserves cookies and never replays
mutations. These are synthetic local accounts/processes, not hosted capacity,
provider/pre-authentication protection or Internet-edge acceptance.

29 September verified-transport configuration: nineteen native shared-session/
HTTP groups passed in `build/postgres-native/s32ab7782db7c/results.json` with the
API launcher using explicit connection parameters. Six separate connection/
environment tests cover rejection of insecure overrides, preserved hosted gates,
and actual TLS acceptance/rejection for trusted, untrusted and DNS/IP-mismatched
certificates. The native database is loopback/plaintext; it does not prove hosted
PostgreSQL TLS, provider CA configuration or failover.

29 September backup-set monitor: fourteen native recovery groups passed in
`build/postgres-native/rffd4f0b9b8fa/results.json`. Monitoring authenticated actual
encrypted PG dumps and worker/rules journals, detected stale captures, wrong keys
and missing required roles without changing archives or database inventory. The
private-config CLI returns 0 for a verified fresh set and 2 for missing journal
coverage, without credential output. Existing tamper, source-absent restore and
review-required gates remain covered. This is local monitoring acceptance, not a
scheduled off-host backup, hosted restore drill or recovery activation.

29 September runtime-profile acceptance passed seven groups in
`build/postgres-native/p5c70faf30ebe/results.json`. Committed API/worker templates
match the executable profile; separate restricted roles ingest records and prepare
real offline signed receipts which the API independently verifies. Actual denied
SQL operations prove evidence/customer separation. Startup rejects excessive
column/table grants, missing required grants, ownership, schema creation and
NOINHERIT membership. Readiness detects post-startup excessive/missing grants and
membership, then recovers after repair. No external provider or chain call occurs.
Run with `npm run test:governance-postgres-runtime-profiles-native` against the
dedicated synthetic cluster only.

The narrower API grants also passed nineteen shared-session/HTTP groups
(`sa2f30c95f49e`, after readiness integration) and eleven customer-directory
groups (`c637657435e6a`); 75
adapter/API/session/worker regressions passed. These are local acceptance proofs,
not hosted identity acceptance, production-role provisioning or deployment.

29 September complete directory session guarding: `s33c470606ce7` passed
nineteen native session/HTTP groups, including ten directory scenarios across
workspace/project/member/invitation writes, reads and action replay. Competing
logout, signed revocation and stale freshness during transaction waits caused
denial with unchanged directory/action state. Invitation acceptance checks its
session after invitation/workspace locks; valid reads remain available after
active-authentication freshness expires. Customer run `c40c24ed43493` passed eleven
groups, including current-owner authority for administrator-invitation revocation
replay after demotion. Separate SQLite worker tests cover nine HTTP paths and
reject split directory/session databases. All 64 affected regressions passed.
Evidence: `build/postgres-native/s33c470606ce7/results.json` and
`build/postgres-native/c40c24ed43493/results.json`.

29 September shared key/session serialization: `s8e002271d61d` passed eighteen
native groups. Seven real HTTP requests waited on a workspace lock while another
connection committed logout, signed provider revocation, provider expiry or stale
active-authentication state. Create/replay/rotate/revoke/list requests were denied
with 401 or the existing 403 reauthentication code; key/action state digests were
unchanged. Stale active-authentication state continued to permit metadata reads.
A controlled guard barrier then proved logout waits on the verified session row
until a winning key creation commits, before invalidating future session use.
Existing renewal, RLS, recovery/readiness and generic launcher flows also passed.
Evidence: `build/postgres-native/s8e002271d61d/results.json`.

29 September SQLite/shared-path authorization regression: key run
`ka8f3366fe890` passed ten native groups and session run `sb8f6969f558f` passed
sixteen. The generic HTTP routes now pass server-only session context to key
administration; PostgreSQL scoped key/action storage still discloses no secrets
and preserves its transaction guards. Separate SQLite worker-thread tests prove
denial after lock-wait demotion, identity disablement, logout and membership removal,
including action replay, plus bearer revocation observed after lock acquisition.
All 62 affected regression tests passed. Native evidence files are
`build/postgres-native/ka8f3366fe890/results.json` and
`build/postgres-native/sb8f6969f558f/results.json`.

29 September transport integration: `s289c6572ee2d` passed all sixteen native
shared-session/HTTP groups with the new upload deadlines and handler/connection
caps. Authenticated provisioning/key administration, signed WorkOS revocation,
shared renewal/reauthentication and storage readiness still pass through the
generic launcher. The six dedicated transport checks separately exercise trickle
timeouts, late-body non-mutation, early denial cleanup, overload rejection and
lease retention after disconnection. Evidence:
`build/postgres-native/s289c6572ee2d/results.json`.

29 September recovery inventory/reconciliation: native run `r5a547cdd122d`
passed thirteen groups. Offline review reports aggregate restored state and missing
recorded owners, refuses future invalidation times, missing event publication entries
and mismatched per-project event/byte counters. Native corruption probes repaired
only their synthetic fixtures after proving rejection; the final preserved-state
digest matched its original. Inventory discloses no customer IDs, emails or keys,
and review leaves every adapter gated. Existing encrypted archive, wrong-key/tamper,
CLI, source-absent and independent receipt/commitment/Merkle checks also passed.
Evidence: `build/postgres-native/r5a547cdd122d/results.json`.

29 September key-history increment: native run `k3d248a5cce69` passed ten
groups, including filtered/paginated metadata across 107 records. An older active
credential remains visible after 105 later revocations, expired/revoked filters
respect effective times, pages enumerate the full history and foreign scopes
return no records. Invalid bounds fail with 400 and lists disclose no credentials
or token hashes. Existing concurrent creation/rotation, lock-wait revocation,
100-active-key quota, rollback, RLS, reopen and authenticated launcher checks also
passed. Evidence: `build/postgres-native/k3d248a5cce69/results.json`.
Separate website build and 31 tests passed; synthetic Edge fixture validation
covered active/default and all-history next/previous/empty-filter controls.

## Five-minute mixed test — passed after freeing host memory

Run `g1ae3d35e1e61` completed on native PostgreSQL 17.11. After the user closed
unused applications, available RAM was approximately 1.5 GiB before retrying.
The test seeded 10,020 runs and submitted 12,000 additional records at a target
40/second, with twelve submission tasks and four authenticated dashboard readers.
The mixed phase completed in 304.459 seconds, including outstanding reads and
monitor completion. All 12,000 HTTP writes and 7,373 dashboard-data requests
succeeded; 7,369 reads began during submissions. There were zero request errors.

| Path | Requests | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Submissions | 12,000 | 5 ms | 13 ms | 20 ms |
| Main report | 702 | 205 ms | 675 ms | 1,649 ms |
| Review queue | 1,558 | 38 ms | 252 ms | 523 ms |
| Event list | 2,670 | 7 ms | 16 ms | 23 ms |
| Other tenant report | 2,443 | 16 ms | 38 ms | 53 ms |

The final primary workspace held 22,020 events: 19,620 model runs and 2,400
adjudicated outcomes. Intentional conflicting labels left 1,440 eligible reviewed
labels. Three model deployments, four task classes and twenty reporting agents
were represented. Final KPIs, model metrics, rubrics, suppression states, exact
latency percentiles and trends matched the independent reference calculation.
Events, outbox and usage each reconciled to 22,020. The second tenant remained
isolated at twenty runs, and forbidden/unscoped access checks passed.

Across 59 resource samples, Node RSS peaked at 174 MiB, available host RAM never
fell below 799 MiB, database size grew from approximately 37 to 66 MiB, maximum
database connections were eleven, and sampled pool waiters remained zero. Samples
are five-second observations, not guarantees about unobserved peaks. No resource
guard triggered. PostgreSQL process RSS/CPU and free disk space were not measured.
Pending records deliberately accumulated because the anchor worker was excluded.

Native backup/restore also passed, preserving complete snapshots and isolation;
the dump was 1,825,679 bytes and restoration took 2.350 seconds. The isolated local
cluster was stopped after completion. VPS and published website were untouched;
there were no model-provider calls or Base broadcasts. Browser rendering was not
tested: these are real API requests through the authenticated website gateway.

Evidence: [full five-minute result and resource samples](validation/governance-postgres-long-passed-2026-09-27.json).
This closes the bounded five-minute mixed-load gate. It does not establish maximum
capacity, a 24-hour SLA, or evidence-worker drain capacity. The 675 ms report p95
is from a longer, larger and more varied labelled dataset than the earlier 222 ms
short test and should not be treated as a controlled performance regression.
Next gates are a longer monitored soak, saturation/recovery, and separately
budgeted receipt-worker/anchoring drain validation.

## Five-minute mixed test — stopped for host memory

Run `g25c59e62488a` attempted the new `--long` scenario: 12,000 submissions at
40/second, one in five an adjudicated label (including deliberate conflicts),
three model deployments, four task classes and four dashboard-data readers.
After seeding, the first resource sample measured only 217,042,944 bytes of host
free RAM (about 207 MiB), below the 512 MiB stop threshold. The sample recorded
eight completed submissions, 207,859,712 bytes of Node RSS and a 38,549,171-byte
database. Additional in-flight submissions may have completed after this sample;
it is not a final reconciliation count. The five-minute test did **not** complete.
The earlier short concurrency passes remain valid at their stated scope.

Evidence: [stopped-run result and resource sample](validation/governance-postgres-long-stopped-2026-09-27.json).
There was no model-provider call, Base broadcast or VPS change. The harness now
checks host memory before seeding, names the specific resource stop reason and
waits for all submission tasks to settle before closing connections. Its low-memory
preflight regression test passes. Free unused host memory before retrying; around
1 GiB free gives headroom above the minimum 512 MiB guard. Do not lower the guard
merely to obtain a passing result. The next run creates fresh synthetic databases.

## Report query optimization — run gde46d22d48e7

The final query upgrade passed the same native mixed-load acceptance scenario:
10,020 seeded runs, 600 HTTP submissions paced at 40/second, twelve submission
tasks and four authenticated dashboard-data clients. The final workspace again
contained 10,620 events with matching outbox and usage counts. All 600 writes
and 430 dashboard reads succeeded; 426 reads began during active submissions.
The complete mixed phase took 15.088 seconds. Native backup/restore and all
existing accuracy, signature, quota, replay and isolation checks also passed.

| Path | Earlier p95 | Final p95 | Final requests |
|---|---:|---:|---:|
| Main report | 2,645 ms | 222 ms | 56 |
| Submissions | 110 ms | 12 ms | 600 |
| Review queue | 351 ms | 39 ms | 119 |
| Event list | 22 ms | 18 ms | 132 |
| Other tenant report | 68 ms | 29 ms | 123 |

Main-report median was 154 ms and p99 340 ms. The observed p95 reduction was
approximately 92%, or 11.9 times faster. These are separate local runs with the
same harness configuration, not controlled production benchmarks or SLA promises;
hardware load and database caches can vary. Faster readers complete more requests
because each reader waits 100 ms between responses. The main performance workspace
contains unlabelled runs; labelled/conflicting outcome correctness is validated by
the known fixture and regression tests, not a high-cardinality labelled load test.

Implementation combines outcome counts, eligibility, correct labels and rubric
identity into one grouped database relation instead of repeated correlated probes
for each metric. KPI totals share one selected-event pass; late linked-event counts
start from available references instead of probing every unlabelled run. There is
no response cache or new migration. Snapshots, exact latency percentiles, tenant
scope, late labels and accuracy suppression rules are unchanged. The shared outcome
relation also improves review queries. Migration 005 remains the prerequisite.

Evidence: [final optimization results](validation/governance-postgres-report-optimization-2026-09-27.json).
An intermediate outcome-only optimization run (`g06838cb9b0fa`) measured 304 ms
main-report p95 and passed before the final KPI change. Tests additionally compare
automated-label exclusion, case mismatches, mixed evaluators, cross-environment
labels and deployment filtering with the reference report calculation.

The dedicated local PostgreSQL cluster was stopped after validation. No VPS,
published website, model-provider calls or Base broadcasts were involved.
Next: a longer bounded mixed-load test with resource/backlog stop conditions,
larger and more diverse labelled cohorts, then saturation and recovery testing.

## Reporting concurrency increment — run g0c8a431e0848

The new SQL reports and review queues passed against native PostgreSQL 17.11
with migration 005 and a restricted runtime role. The isolated workspace started
with 10,020 synthetic runs. Twelve submission tasks added 600 records over HTTP,
paced at a target 40/second, while four authenticated gateway clients repeatedly
requested reports, review queues, event lists and another tenant's report.
Database statistics were refreshed after seeding. Total mixed-phase elapsed time
was 17.052 seconds, including completion of outstanding reads; this is not a
maximum throughput or sustained capacity measurement.

| Path | Requests | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| HTTP submissions | 600 | 11 ms | 110 ms | 281 ms |
| Main workspace report | 12 | 1,102 ms | 2,645 ms | 2,645 ms |
| Review queue | 49 | 197 ms | 351 ms | 425 ms |
| Event list | 115 | 13 ms | 22 ms | 110 ms |
| Separate tenant report | 101 | 40 ms | 68 ms | 136 ms |

All submissions and 277 reads succeeded. Of those reads, 273 started while
between 1 and 599 submissions had completed. Main reports observed increasing
counts during the write phase; their snapshots were internally consistent.
The final workspace contained exactly 10,620 events, outbox entries and metered
events. The separate tenant remained at 20 runs; unscoped SQL and forbidden
workspace requests revealed no records. With only 12 main-report observations,
tail percentile estimates are coarse.

The full acceptance suite also passed duplicate/quota contention, known-fixture
accuracy, signatures and native dump/restore. Source and restored snapshots
matched across 11,433 total events, outbox entries, usage, 182 evidence bundles
and five migrations. The 889,947-byte archive restored in 2.708 seconds. This run
did not repeat the older clean-restart test documented below.

Evidence: [machine-readable concurrency results](validation/governance-postgres-dashboard-concurrency-2026-09-27.json).
Implementation: `scripts/governance-postgres-dashboard-load.cjs`, invoked by the
existing native acceptance runner. Repeat with `npm run test:governance-postgres-native`
after starting the dedicated local cluster. Each execution creates new synthetic
databases. Credentials stay in ignored build files; the published result has no
passwords or tokens. The local test cluster was stopped after validation.

These are real HTTP/API and authenticated portal-gateway data requests, not
rendered browser sessions. No model calls, automatic evidence worker, Base
broadcasts, VPS changes or website deployment occurred. The main report is the
slowest tested path: investigate query plans, repeated scans and snapshot/cache
or rollup design before longer or larger mixed-load runs. Native engine validation
and short concurrent reads/writes are now complete at this scale; continuous
resource monitoring, saturation, failure recovery and 24-hour testing remain open.

## Outcome

The event-store adapter has now been exercised against a standalone PostgreSQL
17.11 server over TCP, rather than only the embedded test engine. Concurrent
writes, pooled tenant isolation, the authenticated HTTP gateway, native backup
and restoration, and persistence across a clean server restart all passed.

Machine-readable evidence: [final acceptance results](validation/governance-postgres-native-2026-09-27.json).
Run ID: `gd4fc649ee059`. All records were synthetic.

| Check | Result |
|---|---|
| Concurrent migration clients | Advisory lock serialized migrations; runtime started with restricted privileges |
| Known model fixture | 182 records; 60 runs; reconstructed 70% and 90% adjudicated accuracy |
| Simultaneous duplicate retries | 40 requests produced one accepted event and 39 duplicate responses |
| Concurrent new events | 600 records accepted using 24 workers and a 10-connection pool |
| Quota contention | Exactly 10 of 40 new records accepted at a 10-event limit |
| Tenant/project isolation | Mixed concurrent reads and unscoped SQL revealed no foreign records |
| Accounting | 793 events, 793 outbox entries and 793 metered events |
| Authenticated gateway | Sign-in, scoped record/report reads and export passed; foreign workspace export denied |
| Backup/restore | Native pg_dump archive restored to a new database; complete snapshots matched |
| Post-restore behavior | RLS, reports and duplicate idempotency retained |
| Clean restart | Source and restored database snapshots, reports and scoped reads still matched |

The measured 600-event burst took 882 ms, approximately 680 events/second, with
40 ms p95 submission latency. This is a short **local storage-adapter** run, not
an HTTP or blockchain throughput benchmark, sustained capacity claim or SLA.
The earlier run measured approximately 625 events/second. Neither should be
extrapolated to a 24-hour capacity estimate.

The final archive was 72,502 bytes; dump and restore took approximately 267 ms
and 173 ms. Those timings cover this tiny synthetic dataset, not production
recovery objectives. Full snapshot comparison included persisted event bodies,
digests, received times, queue statuses, usage counters, migration checksums and
environment binding, rather than just row counts. Sessions were ephemeral and
excluded from backup; real recovery should revoke old portal sessions.

## Local environment and isolation

Portable binaries came from the official
[EDB PostgreSQL binaries page](https://www.enterprisedb.com/download-postgresql-binaries),
using its PostgreSQL 17.11 Windows archive link (file ID 1260569). The downloaded
archive's locally computed SHA-256 was
`b9424ee7bc60b52450ff910a3630225df32e633f3cb29c1d126d9299d59aea28`.
This records the artifact used; it is not an independently published vendor
checksum assertion.

The cluster listens only at `127.0.0.1:55439`, uses SCRAM password authentication,
and lives under ignored `build/postgres-native`. No Windows service, public
listener, firewall rule, scheduled backup or VPS installation was created.
The existing local portal and its SQLite database were not reconfigured.
Runtime roles cannot administer databases, bypass RLS or run migrations.
Each run creates fresh source/restore databases and dedicated owner/runtime
roles. It does not delete or overwrite earlier runs.

Local passwords, backup archives and database files remain in ignored build
directories, containing synthetic data only. The local dump is not encrypted;
this is an acceptance fixture, not the production backup configuration.
Do not copy these accounts or plaintext fixture artifacts into production.

## Repeatable procedure

1. With the portable binaries in `build/postgres-runtime/pgsql`, initialize once:
   `./scripts/governance-postgres-local.ps1 -Action init`.
2. Start the dedicated instance:
   `./scripts/governance-postgres-local.ps1 -Action start`.
3. Run `npm run test:governance-postgres-native`. It creates unique databases,
   applies migrations, runs the checks, dumps and restores, and prints the
   location of its non-secret `results.json`.
4. Stop and start the instance with the same PowerShell script. Run
   `node scripts/verify-governance-postgres-restart.cjs <run-id>` to verify both
   databases and append the restart result.
5. Stop the instance when finished. Databases and dumps are retained locally.

The Windows restricted execution sandbox prevented PostgreSQL's normal process
token creation. Starting/restarting the dedicated cluster was therefore run
outside that sandbox; PostgreSQL still bound loopback only. No broader database
access was granted. The test runner uses TCP SCRAM authentication; remote TLS,
certificate rotation and private network transport remain to be tested.

## What this completes and what remains

This closes the initial standalone PostgreSQL concurrency and logical-restore
validation gap. It does not establish high availability, crash/power-loss
recovery, WAL/PITR, encrypted off-host backups, retention deletion, multi-host
sessions or the planned 24-hour workload. This was a clean restart, not a crash.

The governance-event-to-receipt/manifest/Base link is now implemented locally,
including queued, submitted, confirmed and reorg-aware portal states.
On 29 September, the native shared customer-directory acceptance passed ten
checks using two independent pools and restricted runtime roles. It covers
concurrent provider-subject registration, atomic workspace retries, tenant-scoped
project listing, email-bound invitation acceptance/replay, membership revocation,
final-owner protection, failed-write rollback, pooled RLS isolation, reopening and
disablement, plus key administration that rechecks authority inside its transaction
and observes a committed demotion after a lock wait. Evidence:
`build/postgres-native/c54adaa0841b8/results.json`. Run
`node scripts/test-governance-postgres-customers-native.cjs` with the dedicated
cluster running. Existing nine-check native key acceptance also passed with
migration 007 (`build/postgres-native/k82fa5179faea/results.json`).

The launcher now supports explicit dev/test PostgreSQL control storage. Migration
008 adds hashed application sessions and encrypted single-use PKCE/refresh state;
eleven native session/HTTP checks passed across independent pools, including
concurrent renewal, restart, logout during exchange, deadline enforcement, session
capacity and authenticated workspace/key HTTP flows. Evidence:
`build/postgres-native/s57dd9585ab77/results.json`. Run
`node scripts/test-governance-postgres-sessions-native.cjs`. No real WorkOS account
or existing SQLite customer was migrated in this test. Real provider/browser
acceptance and complete encrypted recovery orchestration remain requirements;
these checks do not close production readiness or availability gates.

Migration 009 and the fresh-target offline recovery adapter now invalidate shared
control-plane access and gate restored repositories. Five native dump/restore groups
passed: source/target protection, mid-write rollback, preserved governance/ownership
history, erased or revoked access, read-only review without activation, runtime gate
mutation denial, signature/commitment/Merkle verification and tamper rejection.
Evidence: `build/postgres-native/ra2fe1c370f72/results.json`. Run
`node scripts/test-governance-postgres-recovery-native.cjs`. This uses an unencrypted
synthetic fixture dump; encrypted PG orchestration, off-host schedules/retention,
PITR, coordinated SQLite worker/delivery journals and owner recovery/activation
are still unfinished.

The encrypted coordinated recovery increment subsequently passed nine native groups
(`build/postgres-native/r70c742df9bde/results.json`). It encrypts a native PostgreSQL
dump and manifest, binds encrypted SQLite journal files to that manifest, validates
every part before creating a target, preserves pending worker/delivery bytes, and
leaves both engines gated. Wrong-key, dump/journal tampering and operator CLI
backup/restore/review checks passed. Five existing SQLite recovery tests passed.
The earlier plaintext dump remains a synthetic fixture; operational bundles from
the new utility contain encrypted snapshots. Off-host scheduling, retention/PITR,
key custody and approved activation/owner recovery remain unfinished.

Migration 010 subsequently passed fourteen native shared-session/HTTP groups
(`build/postgres-native/s58b06ae39ca7/results.json`). New checks cover provider
revocation tombstones, client isolation, concurrent duplicate delivery, rollback
when event persistence fails and a signed HTTP event through the shared launcher.
Twenty-five affected WorkOS/webhook/recovery/environment regression tests passed;
nine encrypted recovery groups also passed with this migration
(`build/postgres-native/r27d122d48a31/results.json`). No real webhook endpoint was
registered or public service exposed; hosted delivery, backfill and MFA remain open.
Migration 011 subsequently passed fifteen native shared-session/HTTP groups
(`build/postgres-native/sb5d5aa81d4b9/results.json`). Refresh preserves active
authentication age; stale administrative writes are denied while reads continue.
Same-subject reauthentication replaces the old session across independent pools.
Twenty-eight affected server regression tests, the website build and 27 website
tests passed. Nine encrypted recovery groups passed with migration 011
(`build/postgres-native/r216b0c40d5ca/results.json`); SQLite recovery also verifies
active-authentication metadata removal. These synthetic checks do not establish
real WorkOS MFA, hosted reauthentication or production readiness.

The runtime readiness increment passed sixteen native shared-session/HTTP groups
(`build/postgres-native/s64e8a7017ab8/results.json`). The generic launcher returns
503 for gated or mismatched storage while liveness remains 200. An exclusive table
lock exercises bounded statement/query waits; readiness recovers after the lock
is released and is withdrawn during draining. Eighteen affected unit/HTTP tests
also passed, including hung pool acquisition shared across repeated requests.
This is local dependency readiness, not hosted monitoring or release approval.

Recovery acceptance subsequently passed eleven groups
(`build/postgres-native/rd9ae78b6ccd1/results.json`). A synthetic source was closed
and renamed without deleting it; its former database name was absent. Authenticated
archive restore succeeded into a fresh target, preserved the full evidence/history
digest, independently verified receipt signature/commitment/Merkle membership,
kept access gated and refused target reuse. Wrong keys still created no database.
This is source-absent local recovery, not independent-host production DR.

The new `inspect` CLI authenticates the full encrypted archive without creating a
database. Native checks cover PG plus journals, fresh/stale time, future timestamp
rejection, wrong environment/key and tampering. Archive hashes and database counts
remain unchanged. CLI output excludes credentials. Scheduled monitoring, retention,
off-host copies and independent restore drills remain open.

The customer-action review reran sixteen native shared-session/HTTP groups
(`build/postgres-native/sd2c84429bf37/results.json`) after adding key-route session,
scope and freshness checks following asynchronous body upload. Twenty-four
key/WorkOS regression tests cover upload-time demotion/logout/disablement and
crossing the active-authentication deadline. Website build plus 30 tests passed,
including gateway/client preservation of structured reauthentication errors and
the read cookie. Real browser/MFA acceptance remains open.

The customer administration follow-up passed sixteen native shared-session/HTTP
groups (`build/postgres-native/s8daf442c9848/results.json`) with post-upload
session/freshness validation on workspace/member/invitation routes. Thirty-two
directory/key/WorkOS regression tests passed. New SQLite second-connection tests
exercise identity disablement and administrator demotion between preliminary
validation and write-lock acquisition, including action replay. Delayed HTTP
workspace/member/invitation uploads crossing the authentication deadline leave
the directory/action history unchanged. Hosted browser/MFA checks remain open.

The migration-014 follow-up passed 24 native recovery groups
(`build/postgres-native/r1f330edd73ae/results.json`). Customer-only activation
rejects snapshot drift after a real lock wait, rolls back an injected gate-write
failure with its private audit, permits fresh sessions/scoped reads and keeps old
credentials, strict publishers and private audit access denied. The same schema
passes 25 shared-session groups (`s68cca24bfb47`) and seven strict-runtime-role
groups (`p3d0ed5532e6a`). These are isolated synthetic local tests, not live
provider, Base publication or hosted recovery acceptance. See the
[customer-only procedure and remaining limits](recovery-access-review.md#customer-only-activation).

Migration 015 passes 27 recovery groups (`r0d2119f81cad`), including an actual
encrypted second-generation restore and fresh customer sign-in after another
selective access/activation cycle. Missing prior audit fails, and injected write
failure rolls back lineage and credentials. The source remains usable and both
generations preserve evidence; publishers stay blocked. Seven strict-role groups
(`p4814249ce8da`) and two migration-approval tests pass with the new private table.

Combined publisher-readiness acceptance passes 28 recovery groups
(`re6cb9c13885e`) using the actual customer-active restore, signed worker bytes
and simulated read-only chain responses. It detects missing links/reservations,
pending nonce activity, changed gate state, wrong runtime code and a final block
change. Compatible local observations retain independent-review requirements and
both gates unchanged. Fifteen worker/recovery regression tests also pass.

Backup-key rotation acceptance passes 29 groups (`rbfaf98a8b6d6`). The new
offline utility and private-file CLI re-encrypt an actual coordinated PG plus
worker/rule archive with a distinct replacement key. Capture time and all source
archive bytes remain unchanged; old/wrong keys and nested output are refused.
The rotated archive remains stale at the same observation time, and actual
new-key restore preserves evidence while access remains gated. No database is
created by rotation itself. Original key/archive retirement and off-host custody
are not performed or established by these tests.

Customer-only readiness acceptance passes 30 recovery groups
(`r334a1b7dd99c`) and four probe regression tests. The actual strict API role is
ready after second-generation customer activation, not-ready at `access-reviewed`
or when draining, while the strict worker remains not-ready at `customer-active`.
No service or publisher gate is opened by a probe.

Migration-016 request-budget acceptance passes nine strict-role groups
(`pa136dcfb8423`): 40 concurrent requests through independent pools admit exactly
20; separate read/write and foreign-scope windows remain independent; policy
disagreement and backwards time refuse traffic. Two loopback HTTP servers with
distinct real hashed keys return 429/retry guidance, and rejected submissions
create no event. Worker/unscoped reads remain denied. Twenty-five session groups
(`sb8146f094670`) verify automatic launcher installation, invalid configuration
refusal and persisted counters for a key operation. Thirty recovery groups
(`r4c783c779de6`) pass through migration 016; 17 service regression tests pass.
These establish local shared enforcement, not Internet-edge abuse protection or
hosted throughput, saturation or multi-host acceptance.

Migration-017 runtime-binding acceptance passes 31 recovery groups
(`r88589672dc04`), nine strict-role groups (`p84c78a97f285`), 25 session groups
(`s991aaaacc07d`) and 16 worker/recovery tests. Synthetic approval rows prove
prepared/revoked/unbound/wrong-role/foreign-project refusal, exact matching
admission, private-audit isolation and duplicate active wallet/project refusal.
Actual repeated encrypted restore revokes captured approvals only in the target
and retains the private review. The worker checks journal ID and actual policy
before mock preparation/sends. No coordinated activation procedure, live
publisher release or distributed singleton guarantee is established by this run.

Before onboarding real customers, establish the separate hosted test environment,
managed identity, encrypted backups, restore ownership and an agreed recovery
objective. Recurring backups and production deployment remain deferred.

Coordinated scoped publisher recovery acceptance passes 34 native groups
(`rcd0e1ffa44e8`). Actual PG/SQLite fixtures prove review reread after an observed
lock wait, stale policy/quiescence/owner-lock refusal, rollback before journal
approval, compensation after a real committed transaction with a lost response,
and retained owner lock when compensation fails. Matching approval loads through
the launcher helper and strict worker; exact scoped/admin-only audited revocation
denies runtime work without changing saved signed jobs or the customer gate.
Head advancement with the same reviewed canonical nonce checkpoint is accepted.
The worker/recovery suite passes 22 tests including checkpoint reorg/regression
refusal. Chain observations and independent review references are synthetic;
there is no live publication, hosted acceptance or distributed worker lease.
The isolated test cluster is stopped after verification.

Private-file publisher operator acceptance passes 35 groups (`r4ecb606ed60a`).
The command module prepares a protected plan and activates actual PG/SQLite
fixtures with an injected synthetic read-only provider. A real subprocess uses
private connection files to revoke the exact binding; prod, unknown fields and
insufficient privileges fail without disclosing credentials or signed work.
Five transport/adapter tests verify fixed HTTPS URL and certificate-validation
options, method/redirect/status/size/time refusal and explicit real-response
chain reads without SDK startup retries. The combined worker/recovery suite
passes 27 tests. This does not verify a live HTTPS RPC or independent review.

Restore behavior follows PostgreSQL's native
[pg_dump documentation](https://www.postgresql.org/docs/17/app-pgdump.html).
