# Archived production-foundations implementation history

Archived on 29 September 2026. Chronological statements retain their original scope and may describe superseded states. Current status is in [the authoritative roadmap](../roadmap-and-decisions.md).

## Current priority — production foundations and customer onboarding, 28 September

29 September evidence-delivery visibility: authenticated project readers now have
`GET /v1/evidence-status` and an Overview panel with pending/batched/submitted/other
counts and the acceptance age of the oldest pending/batched record. Counts cover
all accepted records in the selected project, independently of reporting dates;
unknown or missing outbox state remains visible as Other. Submission does not
claim trusted signature or Base confirmation. SQLite/read-scope HTTP and PG adapter
checks passed; seven native runtime-profile groups (`p509044aea259`) verify strict
API read access/foreign isolation. Website build/34 tests and synthetic Edge visual
acceptance passed. Browser evidence is in
`build/governance/browser-acceptance/evidence-delivery-verified.*`.
This is customer-scoped visibility, not worker-liveness, automatic operational
alerting or a throughput/SLA claim. Hosted aggregate performance, monitors/thresholds
and release decisions remain open.

29 September administration audit increment: new committed membership-action
results capture the previous role alongside the requested new role/removal;
invitation acceptance records the originating invitation reference. Both adapters
save these results atomically with the operation. Idempotent replay retains the
original role transition even after later changes and does not reapply it. Portal
notices distinguish historical replay from newly changed access; older results
without previous-role metadata use a generic saved-action message. Eleven directory/
session-lock tests, thirteen native customer groups (`cd038b7d737a0`) and website
build/33 tests passed. Existing history is not rewritten or inferred. These are
database administration records, not signed governance receipts or Base anchors.
Hosted acceptance, recovery activation and release decisions remain open.

29 September transport increment: API/worker/migration PostgreSQL configuration
now parses URLs into explicit pg options and requires verified TLS outside
loopback. Host/SSL override query parameters, weak SSL modes, duplicate selectors,
missing credentials and client-key material in the CA file fail closed without
credential-bearing errors. Six connection/environment tests passed, including
actual certificate-chain/DNS/IP mismatch handshakes; nineteen native shared-session/
HTTP groups (`s32ab7782db7c`) passed with the changed launcher. See
[connection policy](governance-storage-and-environments.md#postgresql-transport-configuration--29-september).
Managed-provider TLS/failover, deployment isolation and hosted identity acceptance
remain open; staging/production startup gates are unchanged.

29 September customer invitation increment: Settings defaults to pending offers,
with bounded status-filtered history pages and counts. The API/SQLite/PostgreSQL
adapters preserve administrator/session/tenant checks and exclude invitation
secrets. Older pending offers are no longer hidden by the latest-100 history cap.
Ten directory/session-lock tests, twelve native customer groups (`c8427e26d8f84`)
and nineteen native shared-session/HTTP groups (`s64252fd1dde7`) passed. Website
build/31 existing tests and four settings/gateway tests passed. See
[workflow and API contract](authenticated-customer-workspaces.md#invitation-history-and-pending-access--29-september-2026).
Local browser acceptance subsequently passed in the isolated Edge fixture:
Pending default, all three history pages, previous/next state, accepted filter
offset reset, outage recovery and preservation of member data. The outage check
found and fixed a shared list-load failure that left members in Loading. Website
build and 32 tests passed on the corrected UI. Screenshot/text evidence is in
`build/governance/browser-acceptance/invitation-pagination-verified.*`.
Hosted onboarding, required MFA and recovery/deployment decisions remain open.
No public service or email was activated.

29 September backup-monitor increment: the offline PostgreSQL recovery CLI now
authenticates a bounded dedicated capture inventory, checks freshness and required
worker/rules/indexer/relayer journal coverage, and reports nonzero status for
missing/stale/incomplete/invalid/over-limit captures. It selects the latest by
authenticated time and never silently falls back to an older complete journal set.
Fourteen native recovery groups passed (`rffd4f0b9b8fa`), including real encrypted
PG/journal monitoring, CLI exit semantics, unchanged source/archive inventory and
gated source-absent restore; two monitor regression tests passed. See the
[operational procedure](governance-storage-and-environments.md#read-only-backup-set-monitoring--29-september).
No scheduler, retention deletion, off-host custody or hosted environment was
configured; production scheduling and recovery activation remain open.

29 September environment-plan increment: the non-secret four-environment topology
schema, review CLI and example now reject shared declared databases/provider
clients/secret references/signing addresses/journals/backup destinations, mixed
runtime/migration roles, hosted unverified TLS/HTTP, and invalid recovery targets.
Seven deployment/environment tests passed. The review is offline and always
returns `releaseReady:false`; it does not resolve secrets, verify infrastructure
or bypass staged/production startup gates. Example addresses/provider references
are dummy planning values. The
[release sequence](governance-storage-and-environments.md#four-environment-deployment-plan-and-release-sequence--29-september)
records hosted identity/PG acceptance, revocation delivery, evidence reconstruction,
off-host restore, access reconciliation and revision/schema-compatible rollback
requirements. Hosting selection and actual resource provisioning remain open.

29 September directory-session increment: customer HTTP routes now pass a
server-only session authorization hook into their storage transaction. Workspace,
project, membership and invitation changes/replays recheck session validity and
write freshness after authority lock waits; member/invitation reads validate the
session without imposing fresh-sign-in requirements. Invitation acceptance defers
its final check until workspace/invitation locks are acquired. SQLite requires
co-located directory/session state and a synchronous guard; PostgreSQL holds its
verified session row through commit and keeps identity → workspace → session lock
order. Nine SQLite HTTP paths and ten PostgreSQL HTTP scenarios proved rejection
after logout/provider revocation/freshness changes with unchanged customer/action
state. Native shared-session acceptance passed nineteen groups in
`build/postgres-native/s2fff37c173d9/results.json`.
The guard is separate from normalised customer request/action data; session tokens
and callback objects are never persisted there. Trusted internal provisioning
methods remain available without an HTTP session hook. Hosted MFA/onboarding,
owner recovery and deployment/backup gates remain open.

Final directory validation: 64 affected regression tests passed; native session/
HTTP run `s33c470606ce7` passed nineteen groups and customer run `c40c24ed43493`
passed eleven. The customer run also proves that replaying administrator-invitation
revocation requires current owner authority after demotion; this check now occurs
before replay lookup. The slow-upload test stops transmission when it receives
the timeout response. Native evidence is under `build/postgres-native/<run>/results.json`.
Infrastructure selection is pending: existing VPS app with managed PostgreSQL and
separate backup storage, or VPS app/database with separate backup storage. This is
a design decision request, not authorisation to deploy, expose services or spend.
29 September database-role increment: reviewed grant templates now separate the
full shared-control API from the evidence worker. API ingestion/customer/session/
key operations remain available, but evidence is read-only; the worker can prepare
signed evidence and update outbox state without customer/session/key access.
Startup rejects ownership, role membership (including NOINHERIT), persistent DDL,
missing or excessive table/column privileges, and missing forced RLS. Shared-control
API readiness repeats these checks on its bounded read-only probe, detecting grant
drift after startup. Existing mixed-storage event/key grants remain pilot examples.
Fresh non-owner roles and separately provisioned credentials are required; the
templates do not create roles, revoke existing grants, activate services or deploy.
Native profile acceptance passed seven groups (`p5c70faf30ebe`), shared sessions/
HTTP nineteen (`sa2f30c95f49e`, after readiness drift integration), and
customer-directory eleven (`c637657435e6a`).
Seventy-five adapter/API/session/worker regression tests passed. The environment
gate remains dev/test only; no VPS or production configuration was changed.
Hosted provider/browser acceptance, reviewed recovery activation and off-host
backup/deployment decisions remain open.

29 September shared-session key increment: the PostgreSQL control-plane launcher
now verifies the customer session inside the key transaction after authority and
key-scope lock waits, before creation, rotation, revocation, metadata reads or
idempotent replay. It locks the session row through commit; validity, identity
version, provider/absolute/idle expiry and write freshness are checked after waits.
Seven real HTTP lock-wait cases prove denial after logout/provider revocation or
expiry without changes to keys/actions. A separate competing-logout case proves
that a key transaction already holding the verified row commits before logout,
which then denies subsequent session requests. Read-only metadata still works
after active-authentication freshness expires. Eighteen native session/HTTP groups
passed in `build/postgres-native/s8e002271d61d/results.json`.
The final affected regression run passed 62 tests; native key acceptance passed
ten groups in `build/postgres-native/kde3bd82d1fd4/results.json`.
This establishes shared key/session serialization, not live provider acceptance
or the remaining directory-operation session/recovery/deployment gates.

29 September SQLite key-authority increment: the default HTTP key repository now
rechecks session validity, identity/membership/project administration and WorkOS
active-authentication freshness after acquiring its SQLite write lock, before
creation/rotation/revocation or action replay. Metadata listing checks current
administration but retains the existing read access after freshness expires.
Default SQLite key/session state must share one connection; shared PostgreSQL
uses its existing explicit repository instead. Bearer key authentication now
reads validity and updates last-use under one lock, with time evaluated after
lock acquisition. Real worker-thread/two-connection tests cover five administration
races and concurrent key revocation; rejected operations leave key/action state
unchanged. The lock tests are included in `npm run test:governance-project-keys`.
The final affected run passed 62 tests. Native PostgreSQL key acceptance passed
ten groups (`ka8f3366fe890`), and shared-session/HTTP acceptance passed sixteen
(`sb8f6969f558f`), with evidence under `build/postgres-native/<run>/results.json`.
This closes the SQLite key lock-wait gaps; provider/hosted deployment gates remain.

29 September request-resource increment: the shared API server now bounds uploads
to 30 seconds, headers to 10 seconds/8 KiB, inactive sockets to 60 seconds,
connections to 256 and unfinished handlers to 128 per process. Excess handlers
receive 503/Retry-After; timed-out uploads receive 408 and late body completion
cannot create credentials. Early denied bodies are closed. Disconnects retain a
handler's capacity lease until its work finishes, preventing a disconnect/retry
pattern from accumulating unbounded handlers. Six dedicated transport tests plus
37 affected onboarding/keys/WorkOS/readiness regressions passed (43 total).
The final affected regression run passed 60 tests; all sixteen native shared-session/
HTTP groups passed in `build/postgres-native/s289c6572ee2d/results.json`.
The transport suite is included in `npm run test:governance-service`.
These bounds are event-loop-dependent local resource controls. Health/readiness
also receive 503 when the handler cap is full. This does not establish hosted
rate limiting, protection across replicas, capacity, monitoring or deployment.

29 September recovery review increment: coordinated PostgreSQL review now returns
a read-only aggregate inventory of restored customer/workspace/project records,
evidence, registered agents, invalidated keys/invitations and publication states.
It highlights workspaces with no recorded owner without exposing customer IDs,
emails, provider subjects, event bodies or credentials. It rejects missing outbox
entries, mismatched per-project event/byte usage counters and future invalidation
times. Thirteen native recovery groups passed in
`build/postgres-native/r5a547cdd122d/results.json`, including encrypted CLI
round trips, source-absent restore and independent signed-evidence verification.
Counts are not cryptographic verification; review does not activate any component.
PF-02 activation still needs explicit reconciliation of post-backup identity and
membership changes, selective current-owner recovery, journal/chain reconciliation
and reviewed runtime grants. Never re-enable all backed-up members automatically:
revocations after the snapshot must remain effective. Off-host schedules and
monitoring remain open; this increment strengthens the required offline review.

29 September API-key management increment: portal lists now default to active
credentials and expose all/expired/revoked history with 50-row pagination and
matching totals. An older active key cannot be hidden by the previous latest-100
history cap. SQLite/PGlite storage and HTTP/gateway checks passed (10 tests),
native PostgreSQL acceptance passed (10 groups), and the website build plus 31
tests passed. Isolated Edge checks verified filters, next/previous history pages
and empty results using synthetic responses. Native evidence is
`build/postgres-native/k3d248a5cce69/results.json`; browser evidence is
`build/governance/browser-acceptance/key-pagination-verified.png`.
This closes the list-management gap, not live shared-PG/provider acceptance.
Required MFA, owner/account recovery, restore activation, off-host scheduled
backups and operational monitoring remain open in this active goal.

The integration development pass is complete at local alpha scope; its audited
implementation, tests and support limits are in [the SDK plan](sdk-integration-plan.md).
The next authorised work package is production foundations plus customer
onboarding and API-key management. Billing/checkout follows this package; existing
website prices remain indicative and are not an active self-service offer.

| Delivery order | Work and acceptance gate | Current status |
| --- | --- | --- |
| PF-01 Environment separation | Explicit dev/test/staging/prod configuration; bind state to environment; separate database, sessions, signing/relayer keys and identity/billing provider settings; production readiness validation and no accidental public exposure | Generic launcher now uses repository-relative dev/test paths and persistent SQLite environment markers for events/sessions/rules; cross-environment reuse fails and legacy adoption is explicit. Staging/prod startup remains gated; shared storage, secrets/provider isolation and production checks remain open |
| PF-02 Recovery and operations | Repeatable migrations/deploy/rollback; scheduled encrypted backups including control-plane state and journals; documented restore drills, readiness/health and resource/backlog alerts | Gated encrypted local SQLite and coordinated PostgreSQL/journal recovery implemented. Restores remove sessions/flows, revoke keys/invitations, disable identities and block adapters. Eleven native recovery groups passed, including source-absent restore, signature/commitment/Merkle preservation, wrong-key/tamper rejection and non-activating integrity/freshness inspection. Off-host schedules/retention/PITR, key custody/rotation, reviewed activation/owner recovery and monitoring remain open |
| CO-01 Managed identity | Provider-backed registration, verified identity, sign-in/recovery/MFA and secure sessions; do not trust unsigned headers or browser-supplied identity | Live SQLite WorkOS signup/sign-in/renewal passed; shared PostgreSQL sessions/PKCE/refresh, signed replay-safe revocation and active reauthentication implemented. Fifteen native session/HTTP groups and 28 affected regression tests passed. Real provider/browser acceptance on PG, hosted webhook delivery/backfill, required MFA, account/owner recovery and production validation remain open |
| CO-02 Customer provisioning | Persist organisations/workspaces/projects, verified-user ownership and memberships; workspace creation and invitations; explicit owner/admin/reviewer/read-only authority, safe revocation and server-side tenant isolation | SQLite and shared PostgreSQL directory/workspace/project/invitation/membership adapters implemented. Ten native two-pool directory checks passed; the dev/test launcher now supports the complete shared control configuration. Live hosted customer acceptance remains on SQLite. Broader membership browser acceptance, reviewed migration and production lifecycle/recovery remain open |
| CO-03 API keys | Authenticated workspace administration creates scoped project keys; show secret once, store hashes, list safe metadata, expiry/rotation/revocation/last-used, audit actions and recheck validity on requests | SQLite and PostgreSQL key repositories/API/gateway/portal controls implemented. Ten native key checks passed, including full history pagination and active/expired/revoked filtering; current identity/membership/project checks run inside key transactions, including denial after lock-wait demotion. WorkOS-backed writes now require recent active authentication with a portal sign-in prompt. Restored PG keys are invalidated and adapters gated. Approved recovery activation, required MFA, shared-mode browser validation and deployment remain open |
| CO-04 Portal onboarding | Register/sign in → create workspace/project → generate key → first submission → inspect receipt; settings/member/key pages, empty states and end-to-end browser validation | Live hosted signup/sign-in, local owner workspace/project, submission-only key, synthetic first submission, duplicate/scope denial and key revocation passed. Overview and Decisions show the record. Dedicated recording signer/worker published its batch; independent signature, commitment, Merkle and canonical Base Sepolia checks returned confirmed. Wider onboarding/recovery workflows and production deployment remain gated |
| PF-03 Readiness validation | Cross-tenant and role abuse, signup/invite/key replay, revoked sessions/keys, quota/abuse controls, native PostgreSQL, backups/recovery and browser workflows; document limits and deployment decision | Local tenant/role/session/key/recovery tests implemented. Generic launcher now distinguishes process liveness from storage readiness, including environment/migration/recovery checks, bounded PG lock/pool waits and shutdown withdrawal. Eighteen affected tests and sixteen native session/HTTP groups passed. Hosted monitoring, remaining abuse controls and live browser/release acceptance remain open; local checks do not establish production readiness |

WorkOS AuthKit is the recommended managed identity provider after official-source
review on 28 September: hosted identity/MFA/email verification and B2B
organisations fit this product. Basic user management pricing currently includes
up to one million monthly active users; enterprise SSO/custom domains are separate
charges. [Pricing](https://workos.com/pricing),
[AuthKit](https://workos.com/docs/authkit/overview). Account setup, provider
credentials, redirect/domain configuration and live validation were initially pending.
The operator has now created the account, saved the Staging key and configured the
local callback. Key authentication returned HTTP 200; operator registration and
retried sign-in completed the live verified callback. Local workspace/project
provisioning and empty dashboard were verified in Edge; API-key/first-event
browser acceptance now passed locally: one-day submission-only key creation,
synthetic SDK submission, duplicate retry, denied read/cross-tenant access,
portal key revocation and Overview/Decisions visibility. The temporary secret was
removed. The synthetic run now has a signed receipt and confirmed Base Sepolia
anchor; independent signature, commitment and Merkle checks passed. Real WorkOS
renewal also passed without a redirect or resetting session age. Recovery/MFA,
shared PostgreSQL control-plane storage and production gates remain open. No paid
service, production deployment or outbound message was created by the agent. Independent
environment/key work proceeds meanwhile. Customer credentials never belong in browser configuration,
logs or signed governance records. Control-plane changes need their own audit
history; they are not automatically blockchain evidence. Production exposure,
provider setup requiring account action, real outbound invitations/verification
messages and any live rollout require applicable authorisation and configuration.
The goal covers implementation and validation, not fabricated deployment success.

WorkOS development wiring is now opt-in through server configuration, with a
five-minute browser-bound, single-use state/PKCE flow and verified provider subject.
The JWT's signature/issuer/subject/session/expiry are checked; unverified email and
impersonation are refused. Provider access expires at token expiry or 15 minutes,
whichever is earlier; requests now renew using encrypted, rotating server-side
refresh credentials. SQLite consumes credentials before exchange; failures require
sign-in and logout/restore erase them. Eight-hour absolute and 30-minute idle limits
remain. Concurrent renewal, restart, logout races and recovery invalidation are tested.
Shared storage/coordination and provider revocation events remain open. There is no
claimed production MFA enforcement or administrative step-up yet. The ignored local
configuration template is ready and account setup was requested from the user;
no provider account, live sign-in or external email has been created by the agent.
The latest affected directory/key/authentication/worker/recovery suite passed 34 tests.
On 29 September, provider-state persistence was separated behind an asynchronous
repository interface. Independent SQLite connections now use an owner-bound,
30-second durable claim: one exchanges the consumed refresh credential, others
wait for completion; abandoned claims expire without replay. Recovery erases claims.
This remains local SQLite, not shared PostgreSQL customer/session readiness.
The next PostgreSQL increment is now implemented at repository scope: migration
007, shared customer identities/workspaces/projects/memberships/invitations and
atomic action history. Ten native two-pool checks passed, including a key-operation
guard that checks live membership and project ownership in the same transaction,
and rejects creation after a role demotion committed during a lock wait. The nine
existing native key checks also passed with the new migration. Migration 008 now
implements shared hashed sessions and encrypted PKCE/refresh state. The dev/test
launcher can select PostgreSQL control storage with WorkOS and transactional key
authority checks, rejecting configured password accounts and SQLite session paths.
Eleven native session/HTTP checks passed: replay/browser binding, concurrent rotation,
restart, abandoned claims, logout/disablement, idle/absolute expiry, logout during
exchange, session capacity and authenticated workspace/key flows. The existing live
customer remains on SQLite; real WorkOS/browser acceptance on PostgreSQL and
hosted-stage release evidence remain unfinished. PostgreSQL restore invalidation
and runtime gating are now implemented with migration 009: five native recovery
groups passed. Encrypted PG backup orchestration, journal coordination, schedules,
retention/PITR and reviewed recovery activation remain open.
Encrypted coordinated local PG recovery is now implemented: AES-GCM dump/manifest,
authenticated encrypted SQLite journal capture, full validation before fresh-target
creation, private scratch cleanup and gated restore/review. Nine native recovery
groups passed, including pending journal preservation and all operator CLI commands;
five SQLite recovery regression tests passed. Off-host scheduling, retention/PITR,
key custody/rotation, alerts and approved owner/service activation remain unfinished.
Signed WorkOS session-revocation handling is now implemented behind a separate
webhook-secret setting. SQLite/PG tombstones and atomic event/session persistence
prevent replay and out-of-order access creation. Fourteen native shared-session/HTTP
groups and 25 affected regression tests passed; encrypted recovery still passes with
migration 010. No endpoint was exposed or registered: real HTTPS delivery, retries,
backfill/alerts and MFA/step-up/account recovery remain open.
Administrative reauthentication is now implemented for WorkOS-backed API-key,
workspace/member and invitation writes. Verified `auth_time` must be within five
minutes; refresh never advances it. Stale sessions retain reads and the portal
offers same-customer active sign-in before manual action retry. Migration 011
stores the timestamp and subject-bound flow. Fifteen native session/HTTP groups
passed (`build/postgres-native/sb5d5aa81d4b9/results.json`), along with 28 affected
server tests, the website build and 27 website tests. Nine encrypted recovery
groups passed with migration 011 (`build/postgres-native/r216b0c40d5ca/results.json`);
restores erase freshness metadata. Live provider/browser acceptance and required
MFA policy/enrolment remain open; recent authentication alone does not prove MFA.
The subsequent customer-action review fixed separate API-key/Settings response
handlers that previously failed to raise the shared sign-in prompt. A rejected
reauthentication action now prompts without misleading immediate-retry advice,
session-cookie deletion or automatic mutation replay. Key writes also revalidate
session, role/project scope and authentication age after body upload. Twenty-four
key/WorkOS tests passed, including delayed upload with demotion, logout, disablement
and the active-authentication deadline; website build plus 30 tests passed. Sixteen
native shared-session/HTTP groups passed with the changed route
(`build/postgres-native/sd2c84429bf37/results.json`). Live browser acceptance remains
open; these tests do not establish hosted MFA.
Customer workspace/member/invitation POST routes now repeat current-session and
active-authentication checks after body upload, preserving the structured sign-in
prompt on rejection. SQLite directory transactions recheck identity after acquiring
the write lock and administrator authority before action replay; invitation
acceptance uses the current verified email inside that transaction. Thirty-two
directory/key/WorkOS tests passed, including real second-connection lock races and
delayed workspace/member/invitation uploads. Sixteen native shared-session/HTTP
groups passed (`build/postgres-native/s8daf442c9848/results.json`). No provider policy
or public deployment was changed.
An isolated Edge fixture now exercises the actual customer React components with
synthetic responses. Browser checks verified API-key creation and rotation
rejections, Settings workspace rejection, preserved forms/read workspace and the
sign-in link; a simulated callback returns to Settings without replaying writes.
The visual check found controls hidden by the site-wide form reset. Scoped customer
form styling now restores borders, spacing, labels and usable button sizes; website
build and 30 tests passed. Screenshots/transcripts are in
`build/governance/browser-acceptance/`. The fixture never contacts WorkOS, creates
credentials or changes customer data. Live provider/MFA and PostgreSQL-backed
browser acceptance remain required.
