# Governance service

Customer-route transaction sessions: server-generated `authorizeSession` options
flow separately from validated request inputs into SQLite and PostgreSQL directory
operations. They check the current caller inside the mutation/read transaction,
before action replay or data changes. PostgreSQL uses the same session guard as
key administration; invitation acceptance checks only after invitation/workspace
locks, and directory reads acquire identity before workspace locks to preserve
lock ordering. SQLite reads use a short write transaction so session/membership
checks cannot be interleaved with another connection's revocation. Directory and
session storage must be co-located in SQLite. Invalid sessions return 401; stale
active write authentication preserves the 403 reauthentication prompt; reads
remain available with a valid session. HTTP cannot supply the hook, and raw
session context is never normalised into request/action records.
Trusted in-process provisioning calls can omit the hook; public HTTP routes
always supply it. `npm run test:governance-customers` includes the nine-route
SQLite logout race drill. Native `s2fff37c173d9` passed nineteen groups, including
ten PostgreSQL directory scenarios with unchanged customer-state digests.

The final directory/session regression run passed 64 tests. Native shared-session
acceptance passed nineteen groups (`s33c470606ce7`) and customer acceptance passed
eleven (`c40c24ed43493`). Administrator-invitation revocation checks current owner
authority before replay lookup, so demotion cannot retain that privileged replay
path. Both reports remain local synthetic evidence, not hosted customer acceptance.

Shared PostgreSQL key administration now invokes `authorizeKeySession` on the
key transaction's client after identity/workspace and key-scope lock waits. The
launcher wires both directory authority and session checks. The session hash is
set as transaction-local RLS context; session rows are locked through key commit.
Current session ownership/version, provider expiry and absolute/idle deadlines
are required for reads and writes; recent active authentication is required only
for writes. Invalid sessions return 401; stale write freshness returns the existing
403 `reauthentication-required` prompt. Raw session tokens are server-only context,
never stored in key/action records. No provider exchange occurs under these locks.
If logout or signed revocation commits while the key operation waits on authority,
the final session check denies the operation. If the key operation already holds
the verified session row, logout waits until it commits, then denies later use of
the session. Logout does not independently revoke existing application API keys.
Native run `s8e002271d61d` passed eighteen session/HTTP groups, including seven
lock-wait scenarios, no key/action mutations on denial, and commit/logout ordering.

SQLite key administration now has a synchronous authorization hook executed inside
the key transaction after the write lock is acquired and before action replay.
The default HTTP wiring uses co-located session/key storage to re-resolve the session
and current scope, deny disabled/revoked/demoted callers, and require recent active
WorkOS authentication for writes. Lists check administration without requiring a
fresh active sign-in. The raw session context is used only in server memory and is
never included in key metadata/action records. An explicitly supplied repository
must provide its own authorization contract; the shared PostgreSQL launcher does.
Standalone SQLite repository callers may omit the hook for trusted internal tasks;
that is not an externally authenticated administration interface.
Bearer-key validity and last-use updates are now atomic under `BEGIN IMMEDIATE`;
expiry/revocation is evaluated after any lock wait. Synchronous SQLite lock waits
can delay the event loop; they are not cancelled by HTTP timers. Run
`npm run test:governance-project-keys` for lifecycle, HTTP, pagination, native SQLite
two-connection races and embedded PostgreSQL tests.

The final affected authorization regression run passed 62 tests. Native shared-key
acceptance passed ten groups (`ka8f3366fe890`), and shared-session/HTTP acceptance
passed sixteen (`sb8f6969f558f`). These remain local synthetic checks; hosted
WorkOS/shared-PostgreSQL browser acceptance and production deployment are open.

HTTP resource controls in the common server: 30-second upload deadline, 10-second
header deadline, 8 KiB headers, 60-second idle socket timeout, 256 connections and
128 unfinished handlers per process. The deadline starts when request headers
reach the handler; Node's request/header timers also protect transport parsing.
Timers depend on the event loop and cannot interrupt synchronous work.
Excess requests return 503 with `Retry-After: 1`; upload timeout returns 408 and
closes the connection. Early denial/oversize responses close unfinished bodies.
The socket gets a brief graceful close, bounded by a 100 ms destruction fallback;
JSON parsing checks response/request state before any late body can mutate data.
Handler capacity remains occupied after client disconnection until the handler
finishes; closing a response alone does not free capacity for pending database work.
Health/readiness requests use the same cap and can therefore return 503 under load.
Limits may only be reduced through internal `services.httpLimits` options used by
tests; the launcher uses these defaults. These are local transport limits, not
tenant consumption quotas, distributed throttling or a deployment readiness claim.
The final affected run passed 60 tests, including the six dedicated transport
checks. All sixteen native shared-session/HTTP groups passed in `s289c6572ee2d`.
Run `npm run test:governance-service` for the service/transport regression gate.

## Shared project request limits

Migration 016 adds forced-RLS PostgreSQL request windows, separate from storage
and daily-event quotas. The shared PostgreSQL control launcher enables one read
and one write budget per tenant/project across API processes and all project keys
or project-scoped customer sessions. GET requests use the read bucket; other
project requests use write. Authorized attempts are counted before project-route
handling, including invalid requests and idempotent retries. Rejected attempts do
not increment the exhausted window or ingest records.

Defaults are 600 read and 6,000 write requests per fixed UTC minute. Configure
`GOVERNANCE_PROJECT_READ_REQUESTS_PER_MINUTE` and
`GOVERNANCE_PROJECT_WRITE_REQUESTS_PER_MINUTE` identically on every shared API
process; integers from 1 to 1,000,000 are accepted. Invalid configuration fails
before storage startup. Different policies in the same window or a backwards
clock fail closed with 503; a consistent policy takes effect on the next window.
Window rollover reuses the same two rows per project, without request-body or
credential storage. API roles have scoped SELECT/INSERT/UPDATE; workers have no
access. Updated API grants must accompany the reviewed migration.

Excess project requests receive 429, `Retry-After` and JSON
`code: project-request-limit`. Retry with the same event/action ID after that
delay. Storage/daily-event allowances still apply independently; these limits are
operational defaults, not plan entitlements or throughput guarantees. Fixed
windows permit a burst across the minute boundary. Mixed PostgreSQL/SQLite pilot
and SQLite-only launchers retain local transport controls unless supplied this
shared limiter explicitly. Migration 018 supplies the separate verified-customer
windows below for shared-control deployments. Provider callbacks and other
pre-authentication traffic still need separate identity/edge abuse controls.
Internet-facing DDoS/IP controls, hosted load acceptance and commercial
per-project plans remain open.

Native strict-role acceptance verifies exact aggregate limits across independent
pools, RLS isolation, write/read independence, clock/policy drift and two loopback
HTTP servers using distinct hashed project keys. Denied submissions are not
stored. Shared-control launcher acceptance verifies automatic installation and a
persisted window for a real key-administration request.

### Shared verified-customer request limits

Migration `018-customer-request-limits.sql` and the strict API grants add two
forced-RLS windows per verified customer, keyed by the server-resolved identity.
The shared-control launcher installs `PostgresCustomerRequestLimits` after
authentication and before session reads, account-session operations, workspace/
invitation routes, key administration and project operations. Different app
sessions, workspace headers and API processes share the same customer windows.
Project-scoped sessions must also pass the existing project budgets. Project
API keys do not consume a human customer window.

Defaults are 300 reads and 60 other requests per fixed UTC minute. Set
`GOVERNANCE_CUSTOMER_READ_REQUESTS_PER_MINUTE` and
`GOVERNANCE_CUSTOMER_WRITE_REQUESTS_PER_MINUTE` consistently across every shared
API process (integers 1–1,000,000). Invalid settings fail before storage startup.
Same-window policy disagreement or backwards clocks returns 503; a later minute
reuses the existing rows. Authorized attempts and retries count even if a later
route rejects them; exhausted attempts return 429 without incrementing or
executing the operation. Disabled/missing identities cannot create windows.

429 replies include `code: customer-request-limit`, `retryAfter` and a bounded
`Retry-After` header. The website forwards valid retry guidance, keeps the read
session cookie, displays the wait and does not replay rejected mutations. Keep
the original action ID when retrying after the delay.

Login/provider start and callback, webhook delivery, sign-out, liveness/readiness
and unauthenticated requests occur before these windows. Authentication lookup
and renewal cost also occur before admission. Sign-out stays available at the
limit. These controls do not replace Internet-edge/IP protection, provider abuse
controls or hosted capacity testing. SQLite/mixed pilot modes do not automatically
install this shared customer limiter. Counters store only identity references,
window/quota/count metadata; they are not billing or signed governance evidence.
The worker has no access. Apply reviewed migration and API grants together.

Native acceptance verifies exact concurrent customer admission across two pools,
foreign-account/RLS isolation, separate read/write windows, policy/clock drift
and two loopback HTTP servers with different sessions for the same customer.
Denied workspace creations leave no new workspace; sign-out stays available.
Shared-control startup verifies automatic installation and persisted counters
for real session/workspace/key HTTP operations. Portal tests verify bounded
retry guidance, retained cookies and absence of automatic mutation replay.

### Shared sign-in start capacity

Migration `019-auth-start-limits.sql` and updated strict API grants add one
reusable fixed-minute window per configured WorkOS client. The shared-control
launcher supplies this limiter to `WorkosAuth.start` before encrypted PKCE flow
creation or reauthentication lookup. Sign-in/sign-up and active reauthentication
starts share the allowance across API processes; client identity comes from
server configuration, so rotating browser tokens cannot reset it. Invalid
request syntax is rejected before admission. Later failed starts count as
attempts. The default is 120 starts per UTC minute, set consistently with
`GOVERNANCE_AUTH_START_REQUESTS_PER_MINUTE` (integer 1–1,000,000).

Policy disagreement or backwards time fails with 503; exhausted starts get 429,
`code: auth-start-limit` and `Retry-After` without creating a new flow. The
website keeps prior session/flow cookies and returns bounded wait guidance
without a redirect or automatic retry. Existing callbacks are not charged to
this start allowance: they still require an unexpired single-use state, matching
browser proof and verified provider result. Refresh, revocation/webhook processing
and sign-out keep their existing separate checks. The existing 1,000-flow storage
cap also remains in force.

This is an aggregate capacity fuse, not per-person/per-IP bot identification or
account-takeover protection. Exhausting it can delay legitimate new starts, so
hosted traffic budgets, edge/IP controls and alert ownership must be reviewed
before release. Provider exchange/renewal cost and hostile public traffic still
need separate protection. SQLite/mixed pilot modes do not automatically install
this shared limiter. Counters contain only configured provider references and
quota/window/count metadata; they are not credentials, billing or governance
evidence. The worker and unscoped API connections cannot read them. Review and
apply migration plus strict API grants together.

PostgreSQL recovery review now returns aggregate `inventory` counts for customers,
workspaces/projects/memberships, events/evidence/outbox, usage scopes, registered
agents and invalidated keys/invitations. `workspacesWithoutRecordedOwner` identifies
snapshot ownership gaps; a recorded owner remains disabled and has not been approved
for renewed access. Outbox counts distinguish pending/batched/submitted/other without
showing signed bytes or customer data. The repeatable-read, read-only transaction
rejects missing event outbox entries, mismatched per-project event and stored-byte
counters, unsafe counts and invalidation timestamps over five minutes in the future.
Statements have a 30-second timeout and locks a five-second timeout. This offline
operator review may scan the restored database; it is not a request-time health check.
Thirteen native recovery acceptance groups passed in `r5a547cdd122d`.
Inventory interpretation and required activation checks are explicit in CLI output.
Review does not independently validate every receipt or current Base state and
does not clear PostgreSQL or SQLite gates, grant roles, re-enable members, replay
journals or start services. Before activation, reconcile identities/memberships with
changes after the backup, recover current owners selectively, verify evidence and
pending publications/deliveries, and approve least-privilege runtime grants.

API-key listing: authenticated administrators can use
`GET /v1/keys?state=active&limit=50&offset=0`. `state` accepts `all` (API
default), `active`, `expired` or `revoked`; limit is 1–100, default 50;
offset is a nonnegative safe integer bounded below `Number.MAX_SAFE_INTEGER-99`.
Responses include safe `keys` metadata, `total`, `state`, `limit`, `offset`
and nullable `nextOffset`. Revocation takes precedence over expiry once its
effective time is reached; rotation overlap remains active until then.
Count and rows share a storage snapshot and status clock. Pages requested at
different times may shift as keys are created, expire or are revoked.
The portal defaults to active keys, exposes history filters and 50-row paging,
and shows list failures explicitly. No secret/hash is returned in a list.
Native PostgreSQL acceptance `k3d248a5cce69` passed ten groups; SQLite/PGlite
and HTTP/gateway tests passed ten tests. Edge synthetic fixture checks verified
filter/paging/empty states, alongside the website build and 31 tests.
These local checks do not establish hosted shared-PG onboarding acceptance.

Local reporting update: `/v1/report` aggregates in the database beyond 10,000
events and `/v1/reviews` paginates without a raw-event cap. Incident previews are
limited to 100 with explicit `alertSummary` totals; cohort/trend bounds still
fail visibly. PostgreSQL migration 005 and refreshed query statistics are required.
See [reporting contract and deployment gates](../../docs/developer-guide.md#database-reporting-increment-27-september-2026).

Synthetic Base Sepolia pilot, reviewed 27 September 2026. Start with [platform state](../../docs/platform-architecture.md) and [VPS portal operations](../../docs/governance-vps-portal-and-soak.md).

The API accepts bounded structured UTF-8 JSON (64 KiB maximum), scoped by tenant/project. Source conversations, documents, media and raw sensors are unsupported. Event and outbox persistence is atomic; identical retries reuse the accepted record. SQLite serves the VPS pilot; PostgreSQL is implemented and locally validated, not production-deployed.

| Route | Purpose |
|---|---|
| GET /health | Process liveness only; no tenant data |
| GET /ready | Configured storage readiness; 200 ready or 503 not-ready |
| POST /v1/session | Provisioned workspace login |
| GET /v1/session | Resolve scoped session |
| DELETE /v1/session | Revoke session |
| POST /v1/events | Scoped write credential and validated event ingestion |
| GET /v1/events | Scoped filtered/paginated reads |
| GET /v1/events/:id | One structured event |
| GET /v1/evidence/:id | One record, private proof and fresh Base verification |
| GET /v1/report | Reporting; no aggregate claim of verified signatures/anchors |

Browser sessions use the same-origin website gateway and HttpOnly cookies. Project tokens never enter browser storage. SSO/MFA and production identity lifecycle remain gated.

Generic API: npm run governance:serve. VPS API: scripts/governance-vps-api.cjs, loopback 8795 under systemd. Worker: npm run governance:worker, with explicit scope, distinct recorder/publisher keys, journal and enable flag. The local worker launcher refuses operation after VPS ownership migration. PostgreSQL: npm run governance:migrate, migrations 001/002 plus runtime grants; runtime role must not bypass RLS.

See [worker configuration](../../docs/governance-automated-worker.md), [receipt verification](../../docs/governance-receipt-base-integration.md) and [storage gates](../../docs/governance-storage-and-environments.md).
## Runtime readiness — 29 September 2026

The generic dev/test launcher supplies `/ready` with checks for every configured
SQLite event/session/rules database and the PostgreSQL pool, as applicable. Checks
validate environment markers, recovery gates and PostgreSQL migration checksums.
After reviewed customer-only recovery, API/pilot PostgreSQL readiness accepts
`customer-active`; evidence-worker readiness continues to refuse it. Unactivated
restore states remain not-ready. This mirrors customer access while preserving
the independent publisher gate.
They do not scan customer records. Responses contain only `status` and use
`Cache-Control: no-store`; internal exceptions, paths and credentials are omitted.
A server constructed without a configured probe returns 503, never assumed ready.

PostgreSQL probes use read-only transactions, statement/lock/query timeouts and a
1.5-second response deadline. One outstanding probe is shared across requests,
including when pool acquisition stalls; late completion cannot cache a ready
result. Failed clients are discarded. Successful checks cache for one second.
SQLite checks are synchronous metadata reads and inherit database busy timeouts;
the asynchronous deadline cannot preempt a blocked SQLite call. Shutdown marks
readiness unavailable before stopping processors and closing connections.

This endpoint is dependency readiness, not a release gate or a WorkOS/Base/worker
health claim. Startup privilege checks still apply. It has not been deployed to
the VPS launcher. Eighteen affected readiness/environment/service/workspace tests
and sixteen native shared-session/HTTP groups passed. Native evidence:
`build/postgres-native/s64e8a7017ab8/results.json`.

## Customer-managed project key foundation — 28 September 2026

Current storage update: the generic launcher can explicitly select shared PostgreSQL
keys with `GOVERNANCE_KEY_STORAGE=postgres`; the default below remains SQLite.
The API and portal contract is unchanged. See the shared-key increment below.

`project-keys.cjs` persists project credentials as SHA-256 hashes in the existing
SQLite session/control-plane database. This is local development functionality,
not a production identity/provisioning deployment or shared PostgreSQL control
plane. Configured users can be explicitly assigned `workspace-admin`; existing
roles are unchanged. That role has read, manage-governance and manage-keys
permissions; it does not grant ingestion write or human-review permission to the
browser session. Only authenticated workspace-admin sessions manage keys.

| Route | Request / behaviour |
| --- | --- |
| GET /v1/keys | Safe scoped metadata, newest 100; no secret/hash |
| POST /v1/keys | actionId, label, scopes (read/write only), optional expiresInDays (1–365, default 90); returns secret once |
| POST /v1/keys/:id/rotate | Same creation fields plus optional graceSeconds (0–86,400, default immediate); replacement and prior revocation cutoff commit atomically |
| POST /v1/keys/:id/revoke | actionId only; immediate revocation, idempotent retry |

Management requests use the existing `x-workspace-session` and `x-workspace-id`
private gateway boundary. Bearer credentials cannot manage keys, even if a legacy
operator credential contains management scopes. `ovk_` credentials resolve only
through the hashed repository, never through legacy plaintext configuration;
expired/revoked keys cannot regain access through a legacy fallback. Every new
request checks validity; already-authorised in-flight requests are not cancelled.
Last-used means authenticated API use, not successful event acceptance.

Create/rotate action IDs bind actor, project and exact normalized request. Exact
retries return original safe metadata with secret=null and secretAvailable=false;
the original secret cannot be recovered. A lost response requires revocation and
new key creation, not storing plaintext for replay. Changed requests under the
same actionId return 409. At most 100 active keys per project are permitted;
rotation with a grace period consumes another active slot. Terminal keys/action
history are retained; pagination, retention and physical disk limits remain work.
The browser will intentionally receive a new key once for customer copying, but
secrets never enter persistent browser configuration, audit bodies or event data.

Four key tests cover lifecycle/expiry/grace/replay, restart, hash-only persistence,
real authenticated API roles/scope, revoked-token legacy fallback denial and the
real same-origin customer gateway. The administrator API Keys page now offers
creation, one-time copying, bounded expiry, rotation overlap and revocation.
Secrets clear when the view closes, the page becomes hidden or five minutes elapse;
intentional clipboard copying remains under customer control. Exact retries keep
the same action ID; a lost creation response cannot recover a secret.
Combined key/workspace/governance API validation: nine tests passed. Two rendered
key-control tests and all 24 website tests/build passed; actual browser interaction
validation remains open. Provider-backed identity, dynamic ownership/memberships,
environment-bound shared storage, administrator step-up/MFA and production
backup/recovery remain goal requirements; this increment does not close them.

The generic `start.cjs` launcher now uses repository-relative dev/test paths and
checks SQLite environment markers before constructing event/session/rule tables.
Existing unbound files require reviewed adoption; see the
[environment procedure](../../docs/governance-storage-and-environments.md#local-launcher-environment-guards--28-september-2026).
Three environment tests plus existing scheduler/key/workspace/route tests passed
(17 tests total). The dedicated VPS launcher and workers have not been changed or
deployed by this increment. Staging/prod startup remains gated.

## Shared PostgreSQL API keys — 28 September 2026

`postgres-project-keys.cjs` implements the same lifecycle in PostgreSQL migration
006. Run reviewed migrations with the migration owner, then apply the explicit
[optional key runtime grants](../../deploy/governance/postgres-key-runtime-grants.sql)
alongside the existing event grants. Configure `GOVERNANCE_STORAGE=postgres` and
`GOVERNANCE_KEY_STORAGE=postgres`, then start the generic launcher in dev/test.
Startup validates migration history, environment, forced row security and required
privileges; superuser, BYPASSRLS and direct/indirect table-owner membership fail,
including owner membership with NOINHERIT. Staging/production remain gated.

Project key/actions/lock rows use tenant/project RLS plus explicit query predicates.
Authentication starts with transaction-local SHA-256 key-hash lookup, derives scope
from the stored row, then checks expiry/revocation during the last-used update.
Database `clock_timestamp()` rechecks the time after a row-lock wait; a timestamp
captured before the wait could wrongly accept a key just revoked by another instance.
No token, hash or SQL access is exposed by the portal. Context is cleared on commit
or rollback. These are backend-owned database roles: RLS is additional containment,
not a way to let customers choose arbitrary SQL context.

One project lock row serializes mutation transactions across connections/instances:
the active-key limit, exact action retry, competing rotations, old-key cutoff, new
hash and audit action commit together. Failed action persistence rolls back the key.
Secret replay remains unavailable and bearer keys cannot administer other keys.
The generic API now awaits asynchronous key storage, retaining SQLite compatibility.

This is explicit storage selection, not an import. Existing SQLite keys are neither
copied nor consulted when PostgreSQL is selected; plan controlled reissuance before
switching a used deployment. Keys/revocation history now need PostgreSQL backup and
recovery invalidation; the SQLite recovery utility does not capture this state.
Directory/membership/session/OAuth-flow state is still SQLite, so this increment
does not authorise multiple customer-facing instances or production deployment.
Shared identity/session integration, MFA step-up and coordinated PostgreSQL
recovery remain required. The PostgreSQL directory adapter below now provides
transactional current-role checks, but the live launcher still uses SQLite identities.

Three embedded PostgreSQL tests cover lifecycle/storage/RLS/readiness and real HTTP
integration. Native acceptance uses two independent pools and a new synthetic
database on the existing loopback cluster. Nine native checks passed: 24 simultaneous
identical retries produce one key/secret, competing rotations produce one replacement,
blocked authentication rejects a newly revoked key, the 100-active-key cap survives
concurrent creation, failed audit writes roll back, pooled contexts stay scoped,
storage survives reopening, owner membership is refused, and the generic launcher
observes another pool revoking an HTTP-created key. Evidence:
`build/postgres-native/ked809b19e497/results.json`. Run
`npm run test:governance-postgres-keys-native` against the dedicated local cluster;
the script creates new synthetic roles/databases and does not drop existing state.
This is concurrency/security acceptance, not a capacity or availability claim.
Row-security semantics and privilege inspection follow the
[PostgreSQL policies](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) and
[privilege functions](https://www.postgresql.org/docs/17/functions-info.html).

The combined PostgreSQL event/key, SQLite key/environment/directory and WorkOS
regression pass completed 28 tests successfully after the lock-wait fix.

## Shared PostgreSQL customer directory — 29 September 2026

Migration 007 and `postgres-customer-directory.cjs` implement provider-subject
identities, organisations/projects, memberships, hashed manual invitations and
idempotent action history. Native two-pool acceptance passed ten checks. Identity
locks serialize action retries and owner workspace limits; workspace locks protect
project/member/invitation limits and final-owner changes. Permissions are read
after taking the workspace lock. Failed action writes roll back provisioning.

Forced RLS separates actor, provider-subject, checked workspace and invitation-hash
contexts. Only trusted server code sets these transaction-local contexts; they
are not customer headers. Unscoped queries expose no rows. The runtime must have
each required privilege and must not be an owner, owner-role member, superuser or
RLS bypass role. Provider and subject remain the identity key; email never merges
accounts. Disabled identities cannot sign in or provision another workspace.

`PostgresProjectKeys` accepts an optional `authorize` callback. Passing
`(client, principal) => directory.authorizeKeys(client, principal)` rechecks the
actor's enabled identity, current administrator membership and project ownership
inside the same key transaction. Membership updates share the workspace lock;
a key creation waiting on a committed demotion is denied before writing.
The existing configured-account adapter remains compatible without this callback.

Run `node scripts/test-governance-postgres-customers-native.cjs` against the
dedicated synthetic loopback cluster. Latest evidence:
`build/postgres-native/c54adaa0841b8/results.json`. The existing nine-check key
acceptance also passed with migration 007, evidence
`build/postgres-native/k82fa5179faea/results.json`.

The launcher now supports explicit shared control storage, as described below.
No existing SQLite identity, membership, session or key was imported or changed
by these synthetic tests. This is not a production release or availability claim.

## Shared PostgreSQL customer sessions — 29 September 2026

Migration 008 adds hashed application sessions and encrypted single-use PKCE
flows. `postgres-workspace-auth.cjs` reloads customer permissions from the shared
directory and applies the same eight-hour absolute and 30-minute idle deadlines.
Twenty active sessions per identity are allowed; replacing the previous session
remains possible at that limit. Identity and session locks use a common order.
Logout deletes the session, encrypted refresh credential and renewal claim together.

`postgres-provider-sessions.cjs` implements the asynchronous WorkOS persistence
interface. Refresh credentials remain AES-GCM sealed with session-hash associated
data. A durable owner claim consumes a credential once; independent API pools wait
for the replacement, while abandoned claims expire without replay. Completion
locks and checks enabled identity/version, unchanged provider session, claim owner,
absolute/idle deadlines and session existence. Logout during exchange cannot
resurrect access. Access tokens are not stored. PKCE flows remain browser-bound and
single-use; an advisory lock enforces the global 1,000 pending-flow capacity.

Opt in for an isolated dev/test deployment with all three settings:

```text
GOVERNANCE_STORAGE=postgres
GOVERNANCE_KEY_STORAGE=postgres
GOVERNANCE_CONTROL_STORAGE=postgres
```

Prepare a non-secret four-environment topology with
`npm run governance:review-deployment-plan -- <plan.json>` before provisioning.
The [example](../../deploy/governance/deployment-plan.example.json) uses dummy
identifiers; validation is offline and never approves release. Hosted runtime
gates remain unchanged. See the
[release sequence](../../docs/governance-storage-and-environments.md#four-environment-deployment-plan-and-release-sequence--29-september).

`GET /v1/evidence-status` exposes read-authorized, tenant/project-scoped delivery
counts and the oldest pending/batched acceptance age. Overview displays this
all-record snapshot separately from dated reports. Submitted state is not chain
confirmation; unknown/missing outbox state is Other. No raw record or credential
data is returned. See [contract and limitations](../../docs/authenticated-customer-workspaces.md#evidence-delivery-observations--29-september-2026).

PostgreSQL URLs require explicit credentials/database and verified TLS outside
loopback. Only `sslmode=verify-full` (or loopback-only `disable`) is supported;
other URL overrides are rejected. Use `GOVERNANCE_DATABASE_CA_FILE` for a separate
CA certificate, never a private key. API, worker and migration CLI use the same
[transport policy](../../docs/governance-storage-and-environments.md#postgresql-transport-configuration--29-september).

Use a reviewed migrated database and the separate
[`API runtime grants`](../../deploy/governance/postgres-api-grants.sql).
The PostgreSQL worker requires its own
[`evidence-worker runtime grants`](../../deploy/governance/postgres-evidence-worker-grants.sql)
and credential. Fresh non-owner roles are provisioned separately; grant templates
do not create roles or remove old grants. Shared-control startup and API readiness
reject excessive/missing privileges, role membership, ownership and missing forced
RLS. Mixed-storage pilot grants are not the shared-control profile. See
[storage/environment guidance](../../docs/governance-storage-and-environments.md)
for access boundaries and remaining deployment gates. WorkOS server
configuration is mandatory. Configured password users and `GOVERNANCE_SESSION_DB`
are rejected in this mode; no SQLite session database is constructed or consulted.
The launcher installs the shared directory/session adapters and transactional key
membership guard. Existing SQLite deployments keep their explicit/default mode.
Staging/production startup remains gated. This is selection, not identity migration.

Eleven native acceptance checks passed through two pools, signed synthetic WorkOS
responses and the generic HTTP launcher. They cover callback replay/browser binding,
encrypted storage, concurrent rotation, restart, abandoned claims, logout/disablement,
idle/absolute limits, logout during exchange, session capacity and workspace/key HTTP
flows. Evidence: `build/postgres-native/s57dd9585ab77/results.json`. Run
`node scripts/test-governance-postgres-sessions-native.cjs` against the dedicated
synthetic loopback cluster. These tests do not exercise a real WorkOS account on
PostgreSQL, remote TLS, failover or a browser migration of an existing customer.

Shared restore invalidation is now implemented as described below; encrypted
PostgreSQL backup orchestration is now implemented locally; scheduled off-host
operation and reviewed activation remain unfinished.
Do not restore raw session/refresh rows into an active deployment.
MFA step-up, provider revocation events, account recovery and hosted-stage release
checks are also required before production exposure.

## PostgreSQL restored-access gate — 29 September 2026

Migration 009 creates `governance_recovery_gate`. Runtime roles can read this
non-sensitive readiness marker but cannot change it. Event, directory/session and
key adapters check the gate on startup and on transactions. A restored destination
in `review-required` refuses use, even if a caller grants it runtime privileges.

`postgres-recovery.cjs` provides a dev/test offline operator workflow. It issues an
in-process handle only after creating a fresh `gov_restore_*` database and revoking
public connection access. Existing destinations are never reused or dropped. After
restoring without owners/ACLs, invalidation checks that handle's destination name
and database OID, environment and migration history. An arbitrary existing/source
database is not an accepted target. The isolated operator currently requires the
database administrator; this is not the production recovery privilege design.

One transaction locks recovery/access tables, removes application sessions and
PKCE flows, revokes all project keys and invitations, disables identities and bumps
their versions, then marks review required. Governance records, signed evidence,
outbox/counters, workspaces, projects, memberships and action history are preserved.
No API, publisher or restored identity is enabled by the review function. Read-only
review rejects residual access, gate/environment mismatch or insufficient operator
privileges. Restoring standalone worker/delivery journals needs the existing gated
SQLite workflow and a coordinated backup/activation manifest; this PG module alone
does not capture them or authorise transaction replay.

Five native dump/restore acceptance groups passed, including forced mid-invalidation
failure/rollback, source protection, runtime activation denial, restored signature,
commitment and Merkle verification, and review tampering tests. Evidence:
`build/postgres-native/ra2fe1c370f72/results.json`. Run
`node scripts/test-governance-postgres-recovery-native.cjs` against the dedicated
local synthetic cluster. Its dump is an unencrypted synthetic fixture, not a
production backup. Encrypted PostgreSQL backup orchestration, off-host scheduling,
retention/PITR, recovery activation and owner recovery remain required.

## Customer directory and provisioning — 28 September 2026

`customer-directory.cjs` adds local SQLite control-plane tables for identities,
workspaces, projects, memberships, invitations and idempotent action history.
Workspaces are organisations; a project's opaque ID is the existing portal
workspace selector ID, mapped server-side to tenant=organisation ID and
project=project ID. Each project has its own ingestion credentials and evidence.
Membership currently applies to all projects in the organisation; per-project
membership restrictions are not implemented. Existing operator-configured users
retain their existing access; no automatic identity or email-based account merge.

`verifiedIdentity` and `WorkspaceAuth.loginVerified` are trusted server integration
methods, **not HTTP endpoints**. The WorkOS adapter must validate provider subject,
verified email and provider session before calling them. Account identity binds
provider+subject, not email. Only customer sessions use the new provisioning APIs;
legacy password sessions and ingestion keys cannot create customers or memberships.
No live provider integration or registration is claimed by this increment.

| API | Behaviour |
| --- | --- |
| POST /v1/workspaces | actionId/name/projectName; creates workspace, first project and owner atomically |
| POST /v1/workspaces/:org/projects | actionId/name; owner/admin creates project |
| GET /v1/workspaces/:org/members | Owner/admin sees member IDs, email and roles |
| POST /v1/workspaces/:org/members | Owner only: actionId/userId/role; role=null removes existing membership; cannot remove/demote last owner |
| GET /v1/workspaces/:org/invitations | Owner/admin safe metadata; state all/pending/accepted/expired/revoked, limit 1–100 (default 50), offset, total/nextOffset; no token/hash |
| POST /v1/workspaces/:org/invitations | actionId/email/role; one-time manual invitation token, seven-day expiry |
| POST /v1/workspaces/:org/invitations/revoke | actionId/invitationId; immediate revocation |
| POST /v1/invitations/accept | actionId/secret in JSON body; matching verified email; atomic one-time membership grant |

New committed member-change results retain `previousRole` and `role` (null on
removal), and invitation acceptance retains `invitationId`. Idempotent replay
returns the original transition without applying it again; current membership
must be reloaded separately. Existing action results are not backfilled. These
are transactional administration history, not signed receipts or chain anchors.

Gateway actions are workspace-create/project-create/member-change/invitation-create/
invitation-revoke/invitation-accept, plus members/invitations reads. Organisation
query values are untrusted references; API membership checks decide access. Existing
same-origin, HttpOnly session, 4 KiB body and private/no-store response boundaries
apply. No invitation emails are sent. Customer Settings now provides manual-token
copying and password-field acceptance; tokens never enter URLs or persistent
browser storage. Created tokens clear on leaving/hiding the view or after five
minutes. An ordinary settings refresh does not discard a just-created token.

Roles: owner (read/review/governance/keys/membership), workspace-admin
(read/governance/keys/membership), governance-admin, reviewer, reader. Owner alone
changes existing roles or invites/revokes workspace-admin grants; an administrator
cannot promote themselves. Owner is granted by workspace creation or existing owner
role changes, never invitation. Owner/admin can invite other roles. Members list
is administrator-only. API principal/session views reload membership every request;
removal immediately removes future access, not already-authorised in-flight work.
Identity disablement invalidates customer sessions; no customer-facing disable or
recovery workflow exists yet. Organisation ingestion keys remain organisation-owned
after an individual member leaves and require explicit rotation/revocation.

Action IDs bind actor+normalised request/operation; exact retries return the original
result and invitation secret=null. Changed requests return 409. Invitation acceptance
records a token hash in action history, never a plaintext token. Limits: 20 owned
workspaces at creation, 100 projects/workspace, 100 members/workspace at invitation
acceptance and 100 pending invitations. These are local guardrails, not commercial
quotas. Audit/invitation retention and member pagination remain open; pending grants
remain until expiry or explicit revocation when an inviter's membership changes.

Five directory tests and the combined 22-test acceptance suite passed, including
restart with persistent customer sessions, real HTTP/gateway, revoked roles,
cross-tenant denial, last-owner protection and invitation replay/email/expiry.
Provider identity is synthetic trusted test input. PostgreSQL control-plane
migrations, verified WorkOS callbacks/recovery/MFA,
account deletion/owner recovery, abuse limits, backups and live/browser validation
remain release requirements. Production startup stays gated.

The customer Settings view is restricted to the server's canCreateWorkspace flag;
existing configured-password users do not gain provisioning controls. Customers
without projects start in Settings and can create a workspace or accept an
invitation. Owner/admin views show project addition and safe member/invitation
metadata; only owners get existing-member role controls and administrator invitation
options. Successful changes reload the session and project selector, and new
projects become selected. Workspace/project references link to the integration
guide; API Keys and Decisions supply the remaining existing submission/evidence
workflow. A live first-use walkthrough is not yet verified.

Three rendered Settings tests cover the empty state, read-only/admin boundaries,
owner invitation choices and manual sharing disclosure. Website build and 27 tests
passed; scoped strict TypeScript validation of the new component passed. These are
rendered/static and API tests, not full browser interaction validation.

## WorkOS hosted sign-in development integration — 28 September 2026

`workos-auth.cjs` implements opt-in AuthKit authorization-code exchange. The website
has server-only /api/auth/start, /api/auth/callback and /api/auth/status routes;
the governance API has private /v1/auth/start/callback/status endpoints. Status
exposes only whether hosted sign-in is enabled. Existing configured-password
operation is the default; explicit WorkOS configuration enables hosted sign-in/
registration links. Staging and production startup remain gated.

Server configuration: GOVERNANCE_IDENTITY_PROVIDER=workos, WORKOS_CLIENT_ID,
WORKOS_API_KEY, WORKOS_REDIRECT_URI and GOVERNANCE_IDENTITY_SEAL_KEY (32 random bytes,
64 lowercase hex characters). The redirect must exactly match the website origin
plus /api/auth/callback; HTTPS required except local loopback development. The
gateway checks the configured origin and never accepts a caller-selected return
URL or forwards provider credentials to browser JavaScript. Custom auth domains
are not supported in this increment; issuer/JWKS/API endpoints are fixed to WorkOS.

For a non-loopback WorkOS callback, `WORKOS_PILOT_ALLOWED_EMAILS` is required: a
comma-separated, bounded list of up to 100 exact verified email addresses. It is
normalized to lowercase and rejects duplicates, wildcards and malformed entries.
An unlisted verified user is denied before the customer identity or app session is
created. An already signed-in user removed from the list loses the app session and
saved refresh credential on the next request; a provider email change outside the
list is denied during renewal. Loopback development may omit the list to retain
existing local tests. Keep the list in protected server configuration, review it
with the named pilot participants and deploy the same policy to every API process.
This gate does not revoke a WorkOS account or prove MFA, provider revocation
delivery, invitation acceptance or hosted deployment. WorkOS sign-up may still
create a provider account before our callback denies admission.

State is random, hashed in SQLite and bound to a random browser cookie. PKCE uses
S256; its verifier is encrypted with AES-256-GCM and state-bound authenticated
data. State lasts five minutes, is consumed atomically before code exchange, and
cannot be reused after a timeout or uncertain exchange. Restart sign-in after a
failed exchange; don't replay a spent callback. Browser binding is HttpOnly/
SameSite=Lax so it can return from hosted sign-in; the resulting application session
cookie is HttpOnly/SameSite=Strict. HTTPS cookies use __Host- names and Secure.
Completed callbacks redirect to a fixed /workspace and include no token in the body.
Application sessions are hashed at rest. Codes/state appear in provider callback
URLs as required by OAuth: exclude callback query strings from access logs and
tracing before external deployment; responses set no-referrer/private/no-store.

The code exchange uses the configured client secret and PKCE verifier, an allowlisted
TLS endpoint and a bounded response. `jose` verifies RS256 against the client's
WorkOS JWKS, issuer, expiry/issued-at and required subject/session claims; audience
must match when supplied. Response user ID must match the JWT subject and email
must be verified; impersonation responses are rejected. Provider organisations/roles
do not automatically become local ownership or membership. Stable identity binds
WorkOS client ID + provider subject; email matches invitations but does not merge
existing accounts. Missing provider expiry metadata fails closed.

Provider access tokens are not persisted. Refresh credentials are AES-256-GCM
encrypted with the server sealing key and session-hash associated data; the browser
holds only an HttpOnly/SameSite application session cookie. Requests renew access
when the verified provider deadline is within 30 seconds. An in-process coordinator
deduplicates requests; an owner-bound durable SQLite claim coordinates independent
connections to the same database. SQLite durably consumes the old
credential before exchange and stores the rotated replacement only after verifying
signature, issuer, client, unchanged subject/session and current local identity.
Logout during exchange cannot resurrect a session. Timeout, crash with a consumed
credential, invalid response and provider rejection require fresh hosted sign-in.
Existing sessions created before this change need one new hosted sign-in.
Application sessions retain an eight-hour absolute cap and 30-minute idle timeout;
provider access remains bounded by signed expiry and the 15-minute upper limit.
Logout and restore erase renewal credentials. Roles are reloaded for every request.
Other connections wait up to 12 seconds for the owner, then return a retryable 503
without deleting an active session. Claims expire after 30 seconds; an abandoned
claim requires sign-in and never replays the consumed credential. Logout, pruning
and recovery erase claims. The provider-state repository supports asynchronous
persistence, but the deployed implementation remains local SQLite. Shared
PostgreSQL identity/session storage and multi-host coordination are not implemented.
Provider revocation webhooks, MFA step-up and account recovery/email-change policy
remain release requirements. Refresh is not proof of recent MFA. See the official
[refresh-token API](https://workos.com/docs/reference/authkit/authentication#authenticate-with-refresh-token).

## WorkOS session-revocation webhook — 29 September 2026

`POST /v1/auth/workos-webhook` is an opt-in server route. A separate
`WORKOS_WEBHOOK_SECRET` is required; without it the route returns 503. It accepts
only signed `session.revoked` events for the configured WorkOS client. Verification
uses the raw UTF-8 body, millisecond timestamp and HMAC-SHA256 header with a
five-minute tolerance; constant-time comparison precedes strict JSON parsing.
Bodies are capped at 64 KiB and compressed requests are rejected. Unsupported event
types return 422: subscribe this endpoint only to session revocations.

SQLite and PostgreSQL adapters record only client/event/session/provider-subject
IDs, event digest and receipt time, not complete event payloads. Revocation and
idempotency history commit with local session deletion. Matching refresh credentials
and claims are removed; unrelated clients, subjects and sessions remain separate.
Identical retries are acknowledged once; changed content under an existing event
ID is rejected. Persistent tombstones also prevent a delayed callback from creating
access after an earlier revocation. PG migration 010 forces row security and adds
restricted event grants; apply it before using shared control storage. Grant runtime
SELECT/INSERT on `governance_provider_revocations` and `governance_identity_events`.
The existing shared directory/session permissions are also needed. Tombstones are
preserved by backup/restore; a retention/compaction policy still needs design.

Fourteen native shared-session/HTTP acceptance groups passed, including concurrent
duplicate events, cross-client isolation, out-of-order revocation, failed-write
rollback and signed HTTP invalidation through the launcher. Evidence:
`build/postgres-native/s58b06ae39ca7/results.json`. Twenty-five affected WorkOS,
webhook, recovery and environment tests passed. Nine encrypted recovery groups also
passed with migration 010 (`build/postgres-native/r27d122d48a31/results.json`).

The route is still loopback-only and has not been registered with WorkOS. Hosted
HTTPS ingress, endpoint-specific secret custody, real delivery/retry acceptance,
alerts for rejected/stale events and replay/backfill via the Events API remain
deployment requirements. Local sign-out and refresh expiry remain effective if no
provider webhook is configured; immediate provider revocation is not claimed until
delivery is connected. No public endpoint or account setting was changed here.
Signature and event contracts follow the official
[webhook verification](https://workos.com/docs/events/data-syncing/webhooks) and
[session event](https://workos.com/docs/events) documentation.

Administrative reauthentication is implemented for WorkOS-backed API-key,
workspace/member and invitation POST routes. These require a verified `auth_time`
within five minutes. Refresh preserves the original timestamp; missing or stale
timestamps retain read access but return 403 `reauthentication-required` for these
writes. Existing role/tenant checks still apply. Configured local password
development mode is unchanged.

The portal offers `/api/auth/start?screen=sign-in&reauth=1`. The single-use,
browser-bound flow requests `max_age=0`, requires the same customer and recent
signed authentication time, replaces the old application session, and returns to
Settings for manual action retry. No mutation or key secret is replayed.
Migration 011 stores the PostgreSQL timestamp and flow subject binding; recovery
erases authentication freshness metadata.

Fifteen native shared-session/HTTP groups passed
(`build/postgres-native/sb5d5aa81d4b9/results.json`), along with 28 affected server
tests, the website build and 27 website tests. Nine encrypted recovery groups
passed with migration 011 (`build/postgres-native/r216b0c40d5ca/results.json`).
Live hosted reauthentication and shared-mode browser acceptance remain open.
Workspace/member/invitation POST routes also repeat session/freshness checks after
body upload. SQLite directory transactions recheck identity after their write lock
and administrator permission before looking up replayed action results. Invitation
acceptance compares the current verified email inside the transaction. Thirty-two
directory/key/WorkOS tests passed, including second-connection disablement and role
changes during lock acquisition and delayed customer uploads. Sixteen native
session/HTTP groups passed (`build/postgres-native/s8daf442c9848/results.json`).

The isolated customer browser fixture is launched from `website` with
`node tests/serve-browser-fixture.mjs` on loopback port 3013. It uses the actual
Workspace/Settings/API-key components and production base/customer CSS, with
synthetic response data only. POST attempts are counted and rejected; it never
creates a key or contacts a provider/API. The local sign-in link deliberately
returns a simulated page and callback. It is not registered as a product route.
Stop its process after use. Edge checks verified preserved forms/read context,
key creation/rotation and workspace reauthentication prompts, and Settings return
without automatic replay. Evidence is in `build/governance/browser-acceptance/`.
The visual check exposed base-reset-hidden inputs; scoped `customer-controls.css`
now restores visible fields and spaced forms. Website build and 30 tests passed.
This UI evidence does not replace live WorkOS/MFA or shared-storage acceptance.

API-key and customer Settings panels now propagate the structured rejection to
the shared sign-in prompt. They clear any displayed secret and omit immediate-retry
advice for reauthentication failures; ordinary uncertain-response retries retain
their action ID behavior. The gateway preserves the read-session cookie on 403.
No mutation is automatically replayed.

Key POST routes recheck the current session, administrator/project authority and
recent authentication after body upload, before invoking storage. Shared PostgreSQL
transaction permission checks still apply. Twenty-four key/WorkOS tests passed,
including delayed upload across demotion, logout, disablement and the authentication
deadline. Website build plus 30 tests and sixteen native session/HTTP groups passed
(`build/postgres-native/sd2c84429bf37/results.json`). Browser/MFA acceptance is still
required. Active authentication is not proof of a particular MFA factor. The provider's
[reauthentication contract](https://workos.com/docs/authkit/reauthentication)
distinguishes active authentication from renewal. Required MFA policy and real
enrolment/recovery must be configured and validated separately; neither a refresh
nor recent `auth_time` alone proves which factor the user used. Hosted AuthKit's
[MFA configuration](https://workos.com/docs/authkit/mfa) requires special consideration
for SSO users, to whom its required-MFA setting does not apply.

## Encrypted coordinated PostgreSQL backups — 29 September 2026

`postgres-backup.cjs` encrypts a native custom-format PostgreSQL dump and an
authenticated manifest with AES-256-GCM and a separate 32-byte backup key. Optional
worker/rules/indexer/relayer journals use the existing encrypted SQLite snapshot
format; their encrypted files and markers are hashed into the coordinated manifest.
Customer event/control SQLite files are not accepted as journal roles in this mode.

Capture requires an explicitly quiesced dev/test deployment, an offline database
administrator and official binary directory. A remote database connection requires
`sslmode: "verify-full"` and an absolute CA certificate path in the private
connection JSON; both the Node client and native `pg_dump`/`pg_restore` verify
TLS identity. The local loopback profile remains available. It holds SHARE locks
on public tables during the PostgreSQL dump and journal capture. Stop APIs,
publishers, delivery workers and migrations first; this is not an online backup
promise. Each dump/journal is bounded at 512 MiB; native commands time out at two
minutes. Plaintext snapshots exist only in a fresh private scratch directory and
are cleaned on success and failure. Persisted bundles contain encrypted dump and
manifest, encrypted journal bundle and a non-secret completion marker. PostgreSQL
connection passwords are passed through a private child environment, not arguments
or output; inherited PG connection/service variables are removed.

Example private remote connection file (replace every value and protect the file):

```json
{"host":"db.example.test","port":25060,"database":"governance_test","user":"offline_admin","password":"REPLACE","sslmode":"verify-full","caFile":"C:/PRIVATE_OPERATOR_DIRECTORY/database-ca.pem"}
```

The restore command's connection file uses the same host, user, TLS mode and CA
file, with `database` set to an approved maintenance database: `postgres` for
the local cluster or `defaultdb` for a DigitalOcean cluster. DigitalOcean
documents `defaultdb` as its built-in administrative database.
[Provider connection guide](https://docs.digitalocean.com/products/databases/postgresql/how-to/connect/).
Confirm `CREATEDB` access before relying on this procedure. A locally passing
transport check does not prove that the chosen managed provider allows the
complete restore and release flow.

Restore decrypts and validates the complete manifest, dump and journals before
creating a database. Wrong keys, changed ciphertext, hashes, roles or unexpected
files fail before import. SQLite journals are invalidated and gated; native PG
restore uses a fresh target without imported ACLs/owners, then applies shared-access
invalidation and review. Existing databases are not reused or deleted. A failed
new destination remains offline; successful review does not enable it. An
authenticated archive now restores even when the original source database is
absent. The destination still must be a fresh, differently named database.
Acceptance uses a local dev/test cluster; independent-host recovery and release
activation still require a deployment design and drill.

The CLI is `node scripts/governance-postgres-recovery.cjs backup|restore|review|inspect|monitor|rotate-key|copy
private-config.json`. Connections and backup keys are read from private files;
neither belongs in command arguments or chat. Procedure and configuration fields
are in [the operations runbook](../../docs/operations-runbook.md#encrypted-coordinated-local-recovery).
Eleven native recovery groups passed, including encrypted PG plus pending worker and
delivery journals, wrong-key/tamper rejection before target creation, preserved
pending bytes, source-absent restore and all four CLI commands without credential output. Evidence:
`build/postgres-native/rd9ae78b6ccd1/results.json`; five SQLite recovery tests also
passed. Restored SQLite snapshots use DELETE journal mode while gated so repeated
read-only inspection does not generate WAL/SHM files or invalidate later review.

`inspect` requires only `environment`, `directory`, `keyFile` and optional
`maxAgeHours` (integer 1–720, default 24). It authenticates/decrypts the full archive,
validates hashes and journal recovery state in private temporary storage, then
cleans scratch files. It creates no PostgreSQL database and never alters the archive
or starts a service. Timestamp integrity is checked against the encrypted manifest.
Results report integrity and freshness with no connection credentials or customer
records. Exit 0 means verified/fresh, 2 verified/stale, 1 failure. This is an
operator I/O task, not a public HTTP probe, and does not replace a native restore
drill or prove an off-host copy exists.

`copy` accepts a private config with `environment`, absolute `directory` of a
complete encrypted archive, absolute existing `destinationRoot`, and `keyFile`.
It authenticates the source, copies a fixed inventory with the completion marker
last, compares source and destination file hashes, and authenticates the copy.
The destination must be a separate directory tree; the operation does not create
or select a cloud bucket. It reports `destination-filesystem-only` because a
path alone cannot prove another provider, retention, or independent failure
domain. Restore and review from the copied archive before relying on it. The
local managed-like PostgreSQL test does this with one synthetic record and
keeps the restored gate closed.

Off-host backup scheduling, retention/PITR, alerts, key custody/rotation, independent
restore drills and approved owner/service activation remain release requirements.
No scheduler, remote object store, live customer restore or production service was
created by this increment.

Local preparation: the ignored `build/governance/dev/workos.env` contains an isolated
development database path, loopback port 8798, redirect/origin and a generated
sealing key. The Staging client ID and operator-entered API key are saved; a
read-only WorkOS request returned HTTP 200 on 28 September. Do not paste the key
in chat. The saved callback is `http://localhost:3001/api/auth/callback`.
The website edge runtime reads its API URL/origin from ignored `website/.dev.vars`;
for this isolated test use API port 8798 and origin `http://localhost:3001` there,
without copying the WorkOS key or sealing key into the website configuration:

```powershell
# From repository root, separate terminal:
node --env-file=build/governance/dev/workos.env services/governance/server.cjs
# From website/, after coordinating with any existing local website process:
node --env-file=../build/governance/dev/workos.env --run dev -- --port 3001 --hostname 127.0.0.1
```

Account setup review, 28 September: Orvessian's WorkOS account now exists and the
official remote MCP endpoint is configured, OAuth-authenticated and verified through
its identity/application/settings queries. The existing Staging application matches
the local client ID. Signup and required email verification are enabled; MFA is off.
Its access tokens expire after 300 seconds, so current app sessions expire within
five minutes (earlier than our 15-minute upper bound); refresh is still unbuilt.
The exact local callback is now saved; logout URIs remain unconfigured. The live
portal's Create an account link reached the real Staging AuthKit registration page.
A gateway runtime failure was fixed by using manual upstream redirects and rejecting
non-success responses; eight authentication tests pass, including redirect refusal.
Registration/password/email verification are handed to the operator in Edge.
Live acceptance follow-up: operator registration returned to the portal, but the
first callback failed before identity/session creation. Issuer verification now
accepts exactly WorkOS's documented bare API issuer and this application's
client-specific AuthKit issuer, with client-ID and impersonation-claim checks.
Nine authentication tests pass, including foreign issuer/client rejection.
Retrying Sign in reused the hosted session and completed the real callback.
The portal displayed the verified customer, first-workspace screen, owner-created
local test workspace/project and connected empty dashboard. API-key/first-event
browser acceptance was subsequently exercised: the real verified customer's local
portal created a submission-only key with one-day expiry. The SDK submitted a
synthetic run to the live loopback API; identical retry returned `duplicate`,
write-only reads and cross-tenant submissions both returned 403. The key was
revoked through the portal and its temporary secret removed from the private env
file. Renewed hosted sign-in restored the persisted workspace; Overview showed
one reporting agent/run and 125 ms latency, and Decisions showed exactly one
record. This run is synthetic and not signed/anchored; it is not evidence of Base
verification or model accuracy. Thirteen key/authentication tests pass. Recovery,
MFA and refresh/revocation integration remain open. The five-minute session expiry
interrupted the first refresh and required sign-in; seamless session renewal is
a follow-up customer-experience requirement addressed by the renewal implementation
above; real provider renewal acceptance is recorded separately below.

WorkOS workspace evidence acceptance, 28 September: the isolated local workspace
now uses its own recording signer, relayer and durable worker journal. The prior
relayer is VPS-owned and was not reused locally. A single-record signed batch was
published to Base Sepolia as transaction
`0x1c010dc87122ab7a6002cf5196a9e4e49976843865844524001f28d69477bfa9`.
Independent inspection returned `confirmed`, valid trusted signature, matching
record commitment and valid Merkle membership, with 76 confirmations at the check.
This attests recording/inclusion, not source completeness, AI accuracy or Ethereum
finality. The API trusts this dedicated recorder and uses read-only Base RPC checks.
Future publishing uses explicit worker enablement, at most two transactions/hour
and 0.0001 test ETH daily reservation; ongoing execution needs operator approval.
The wallet is for Base Sepolia test ETH only. Thirty-two affected authentication,
key, directory, worker and recovery tests pass, including encrypted rotation,
concurrent requests, restart, uncertain exchange, logout races and recovery erasure.
Issuer references: [session tokens](https://workos.com/docs/reference/authkit/session-tokens)
and [AuthKit emulator issuer behavior](https://workos.com/docs/cli/emulate).
MCP authorization is an operator integration and does not supply the platform's
server-side API key. No production provider settings were changed.

Keep browser URL/origin/WorkOS redirect port consistent. Do not reuse development
credentials, sealing keys or databases for staging/production. Sealing-key rotation
invalidates outstanding flows; controlled recovery/rotation still needs documentation
and testing. Back up control-plane state and protect keys separately. No live provider
account, email or deployment has been created or triggered by this increment.

Six provider tests use local signed JWTs and simulated code-exchange responses;
they cover wrong browser, replay/concurrency, expiry, incorrect signatures/claims,
email/impersonation, encrypted state reuse by a new provider instance, missing
deadline metadata and real HTTP/gateway cookies. Combined backend suite: 28 passed.
Website build and 27 tests passed. Actual browser cookie behaviour and hosted
signup/recovery/MFA still need live validation. Auth start capacity is capped at
1,000 pending flows; persistent per-client/edge throttling remains a release gate.

Official references reviewed on 28 September:
[authorization and PKCE](https://workos.com/docs/reference/authkit/authentication/get-authorization-url),
[code exchange](https://workos.com/docs/reference/authkit/authentication),
[session semantics](https://workos.com/docs/authkit/sessions),
[jose verification](https://github.com/panva/jose). Root dependency audit now reports
zero advisories after pinning jose 6.2.12 and overriding the compiler's tmp dependency
to 0.2.7. Solidity stays pinned to 0.8.24; compiler smoke and existing anchor artifact
checks passed. Website/transitive runtime/security review remains separate work.

## Encrypted local recovery foundation — 28 September 2026

`recovery.cjs` and `scripts/governance-recovery.cjs` provide explicit dev/test SQLite
capture/restore. They do not deploy schedules, contact remote storage, stop/restart
services or enable production. The native PostgreSQL logical recovery test remains
separate; this utility is not a PostgreSQL/PITR tool. PF-02 is partially complete.

Capture requires consistency=quiesced: **stop every writer first**, including API
session reads, workers, rule processing and webhook delivery. This acknowledgement
is operator-supplied, not proof that writers stopped. SQLite's backup API captures
each snapshot without losing WAL state. Separate files are not one atomic online
snapshot; quiescence is required. Explicit roles: events/control/rules/worker/indexer/
relayer, with distinct paths. List a merged event/control-plane file once. Inventory
every database/journal; omission is not detected automatically. A PostgreSQL event
store plus separate SQLite control state requires a coordinated PG recovery design;
this tool alone cannot produce that complete backup.

Sources must already have a matching environment marker and pass integrity/foreign
key checks. Unbound VPS/journal files require a separate reviewed environment-binding
procedure; capture never adopts or changes them. Limits: 512 MiB/file, six files,
64 KiB manifest. No staging/prod bypass; larger datasets require production tooling.

Snapshots and manifests use AES-256-GCM with fresh nonces and authenticated backup
ID/environment/role. The encrypted manifest holds snapshot SHA-256 checksums, sizes
and table row counts. A final complete marker follows flushed encrypted files;
power-loss durability on actual storage remains to test. Scratch/bundle/recovery
directories use Unix 0700 or restricted current-user Windows ACLs. Plaintext snapshots
exist briefly in private scratch space and are removed after encryption. Crash-orphan
cleanup and encrypted scratch-volume policy remain operational requirements; file
deletion is not secure SSD erasure.

Use a separate 32-byte backup key stored as 64 lowercase hex characters in a protected
key file. Never reuse wallet/identity sealing keys. The CLI refuses symlink/non-regular
keys and Unix group/other permissions; restrict Windows key-file ACLs before use.
Keep encryption keys away from backup storage, logs/chat and committed configuration.
WorkOS secrets, sealing keys and recorder/publisher keys need separately protected
escrow; they are excluded from the bundle. Losing the backup key prevents recovery.

Customise [backup configuration](../../deploy/governance/backup.example.json) and
[restore configuration](../../deploy/governance/restore.example.json) under ignored
build/. Paths resolve against the current directory; run from repository root after
stopping writers and protecting a separate key:

```powershell
node scripts/governance-recovery.cjs backup build/governance/dev/backup.json
node scripts/governance-recovery.cjs restore build/governance/dev/restore.json
node scripts/governance-recovery.cjs review build/governance/dev/review-restore.json
```

Restore authenticates every file and verifies environment, checksum, integrity and
row counts into a fresh private directory. It never replaces a running database.
Before releasing restored state it deletes portal/provider sessions and OAuth flows,
revokes persisted project keys/invitations and disables customer identities, retaining
memberships/history for review. This avoids reviving access revoked after capture.
Failed restore removes only its newly created partial directory; sources stay unchanged.

A review-required gate blocks the generic launcher, API constructor, governance worker
and webhook journal from activating restored state. Direct database inspection is
allowed; no automatic approval command exists yet. Before reviewed activation:
reconcile ownership/provider status and all revocations since capture, replace external
legacy credentials, reissue keys, validate reports/proofs and reconcile pending signed
transactions with canonical chain state. Preserve exact signed job bytes/nonces. No
automatic wallet replacement, journal replay or email delivery occurs on restore.
Current-owner recovery and a reviewed activation workflow remain goal requirements;
manually changing the marker is not a substitute for these checks.

Customise [review configuration](../../deploy/governance/review-restore.example.json)
with the fresh restore directory. The read-only `review` command requires no backup
key and checks every listed database for integrity, foreign keys, environment binding,
the review-required gate, empty sessions/OAuth flows, disabled identities and revoked
keys/invitations. Future API-key revocation times fail because those keys could still
authenticate. Unexpected files (including active SQLite WAL/journal files) fail; keep
all writers stopped. Output contains only backup ID, environment and per-file status,
size and table counts, never records, identity details or secrets. Passing review
leaves activation gated. This is an operational inspection of current restored state,
not proof against an attacker who can rewrite the recovery directory, not an online
snapshot, and not ownership/provider/chain reconciliation or production approval.

Five recovery tests cover evidence/idempotency/tenant isolation, access invalidation,
journal preservation, activation refusal, wrong keys/corruption/environment mismatch,
capture guards and real backup/restore/review CLI round trips without printing keys
or stored data. Review also rejects re-enabled identities, future key revocation,
changed gates, mismatched environments and unexpected files without modifying the
database. The expanded affected backend suite passed all 47 tests, including worker/delivery and
embedded PostgreSQL adapter regression tests. These are synthetic local drills, not
scheduled production recovery. Off-host storage, key escrow, RPO/RTO, retention,
backup-age/failure alerts, periodic drills, shared PostgreSQL control state and
production restore/release approval remain open. No VPS state was backed up or changed.

The [Node SQLite backup API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
provides snapshots; cross-file quiescence is our explicit operating requirement.
Live renewal acceptance: a normal portal evidence recheck within the access-token
renewal window exchanged the real WorkOS refresh credential. Read-only observation
confirmed ciphertext rotation, advanced access expiry and unchanged absolute session
start; the browser stayed on the authenticated workspace. No provider credentials
were printed. The portal also displayed Base Sepolia L2 confirmed, matching record
commitment, valid recording-service signature and valid batch inclusion proof.
