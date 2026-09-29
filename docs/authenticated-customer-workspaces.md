# Authenticated customer workspaces — 2026-09-26

## First-pilot customer admission — 29 September 2026

The supervised pilot now has a server-side WorkOS admission gate. A non-loopback
callback URL requires `WORKOS_PILOT_ALLOWED_EMAILS` in protected API configuration;
the list contains exact verified email addresses, not domains or wildcards. The
callback checks the current verified provider email before creating an identity or
app session. Existing app sessions are checked against the current list on each
request, and a provider email outside the list is denied during renewal. Removing
a participant therefore ends their app session and saved renewal credential when
they next use the service. The provider account itself is not removed.

This is a controlled pilot admission policy, not MFA, a public signup policy or a
replacement for workspace invitations and roles. The list must be reviewed with
named pilot participants and installed consistently across all hosted API
processes. Local loopback development may omit it. Forty WorkOS tests pass,
including unlisted callback denial before identity/session creation, removal of
an existing app session and denial after a provider email change on renewal. Hosted
shared-PostgreSQL and real provider acceptance remain open.

## Shared customer request controls — 29 September 2026

The shared-control launcher also supplies aggregate sign-in start capacity via
migration 019. Sign-in/sign-up/reauthentication starts share a configured-client
fixed-minute allowance across API processes; browser-token rotation cannot reset
it. Exhausted starts create no encrypted flow and do not consume an existing
callback. The website returns bounded wait guidance while retaining prior flow
and session cookies. This is capacity protection, not bot identification, MFA
proof or an Internet-edge control. [Configuration and limits](../services/governance/README.md#shared-sign-in-start-capacity).

Native role run `p828b089b1ce8` passes 12 groups; session/launcher run
`s823b631a7f19` passes 27. Independent pools admit exactly 20 of 40 configured-client
starts and enforce client/RLS/worker isolation and policy/clock drift denial. Two
real loopback servers share the start allowance, create no denied flow and permit
consumption of an admitted callback. The WorkOS suite passes 38 tests, including
completed callback acceptance after start exhaustion with a synthetic signed
provider result. Website build and 40 tests pass, including retained flow cookies
and bounded sign-in retry guidance. No real provider policy, account or service
was changed.

Shared PostgreSQL customer sessions now pass identity-scoped read/write windows
before account/workspace/key/project operations. Multiple sessions, API processes
and workspace selections cannot reset a customer's current window. Defaults are
300 reads/60 other requests per minute; project-scoped sessions also pass the
separate project allowance. Exhausted operations receive 429 with a bounded wait,
retain the portal session and do not automatically replay. Sign-out remains
available. Authentication/provider/public-edge controls are separate release
requirements. [Configuration and exclusions](../services/governance/README.md#shared-verified-customer-request-limits).

Native role run `p47350c0eba7c` passes 11 groups, including exact 40-request
concurrent admission across two pools, foreign-account/RLS/worker isolation,
clock/policy disagreement and two real loopback servers with separate customer
sessions. Denied workspace creations leave no new workspace. Shared-session
run `s8ae25675de73` passes 26 groups, including automatic installation,
settings validation and persisted session/workspace/key counters. Website build
and 39 tests pass, including bounded retry guidance and no automatic mutation
replay. Synthetic accounts and loopback processes do not establish hosted abuse
protection.

## From a project key to the first record

The API keys panel now shows the selected customer's tenant reference and project reference, plus a copyable Python standard-library example. References come from the authenticated session's customer workspace/project projection; the selected project's ID is not inferred from a key label or supplied by an unauthenticated request. Configured legacy accounts without a customer tenant reference do not get an invented example. Switching project remounts the key panel and its example.

The example reads `ORVESSIAN_API_KEY` from the application's environment and `ORVESSIAN_API_URL` from the operator-supplied API origin. It never includes the one-time key in generated source, URL, browser storage or the copy action. Only HTTPS origins or loopback HTTP test origins are accepted; embedded credentials, paths, query strings, fragments and missing hosts fail. Redirects are rejected so the bearer credential is not forwarded to another endpoint. Responses are bounded to 64 KiB and requests time out after ten seconds. A public ingestion endpoint is not invented or exposed by this change; customer delivery still requires the hosted connection/release work.

Running it submits one explicitly synthetic test `ai.run.completed` record with a new event, run and stream ID. It has structured agent/model/task/result fields and no source conversation/document content. It calls no AI provider. Use a test project: this synthetic record contributes to that project's reporting. Read-only keys cannot submit. The panel explains how to find the printed ID in Decisions, refresh Overview and distinguish API acceptance from later signed receipt, batch and Base verification. If a response is lost, retry the same event object/payload; a fresh script run creates a new synthetic record rather than retrying the old one.

Validation: the website build and 35 tests pass, including rendered scope references and a secret-free example. `npm run test:governance-onboarding-python` actually executes the generated Python against the loopback API with ephemeral hashed project keys in memory: accepted (201), same-payload duplicate (200), one pending record, foreign tenant denied (403), read-only denied (403), revoked key denied (401), unsafe origin refused. Two real loopback endpoints exercise 301/302/303/307/308 redirects: the target receives zero requests. An oversized response is also refused. No persistent customer credentials or external submissions are created. Set `GOVERNANCE_TEST_PYTHON` to an installed Python executable before running this script if `python` is not on PATH.

Edge visual acceptance uses the browser-only synthetic fixture. Tenant/project values, expanded example, key controls and follow-up instructions were inspected without creating credentials or attempting writes. Screenshot/text evidence: `build/governance/browser-acceptance/first-submission-verified.png` and `.txt`. This is portal-rendering and local API evidence, not a real hosted WorkOS/PostgreSQL customer journey.

## Missed session-revocation replay

The existing `WorkosAuth` instance now exposes an operator-only `replayRevocations({rangeStart, rangeEnd, maxPages?, maxEvents?})` method. This is not a customer HTTP endpoint or recurring job. It uses the instance's private WorkOS configuration, fetch transport and SQLite/shared-PG revocation repository; callers cannot override client, credentials or repository through the method's options.

Supply canonical UTC ISO timestamps for a past window of at most 24 hours. The authenticated fixed WorkOS `/events` request filters `session.revoked`, orders ascending and follows validated event cursors. Defaults and maxima are ten pages and 1,000 distinct events; each page is limited to 100 events and 1 MiB. Observations use five-second abort signals and a thirty-second collection budget; the configured fetch transport must honor cancellation. No retries are automatic. The complete bounded window is collected and validated before any session is changed. Oversized windows, malformed events/pages, cursor loops, conflicting event IDs, out-of-window timestamps and provider failures fail without applying collected events.

Only events with the configured client context are applied. Foreign-client revocations are counted and skipped. Missing client context is an error, not a reason to infer or widen identity scope. Events use the same canonical digest and transactional revocation repository as verified webhooks: replayed events deduplicate, revoked sessions and encrypted refresh credentials are deleted, and later callbacks cannot resurrect a tombstoned provider session. If a database write fails after earlier events committed, rerun the same window; those committed events return duplicate. An existing conflicting digest fails rather than overwrite history.

The aggregate result reports window, pages, counts and `historicalCoverage: not-proven`; it contains no subjects, session IDs, provider credentials or raw payloads. A successful selected window does not establish coverage before it, across provider retention gaps or after it. Before hosted release, assign an operator, schedule overlapping replay windows, persist successful coverage and alerts, and reconcile any retention gap by requiring affected customers to sign in again. No schedule, public endpoint or provider revocation request is installed here. The provider contract is described in [WorkOS Events API](https://workos.com/docs/reference/events).

Validation: `npm run test:governance-workos` passes 28 tests, including four new replay tests with actual ephemeral SQLite sessions. Native run `sd30db70a5bf9` passes 21 session/HTTP groups under strict API grants and forced RLS; the new group removes a missed session and encrypted credential across independent pools, preserves unrelated access, deduplicates subsequent webhook delivery and retains denial of unscoped session reads. Provider responses are synthetic. Real HTTPS/provider delivery, scheduled coverage and required-MFA acceptance remain open.

### Durable coordinated replay progress

`WorkosAuth.reconcileRevocations({startAt, overlapMs?})` performs one bounded replay step using durable progress. Supply an explicit canonical UTC baseline; it is stored once and cannot be silently replaced on restart. The baseline is an operator declaration, not evidence that earlier history has been reconciled. A default sixty-second overlap (configurable 1–300 seconds) repeats the edge of the previous successful window, and a five-second lag avoids selecting the current instant. Catch-up steps cover at most 24 hours each. A busy lease returns `busy`; a window that cannot advance returns `not-due` without recording a failure.

SQLite stores progress in the existing private session database. PostgreSQL migration `013-provider-replay-progress.sql` stores it under forced client-scoped RLS, with only SELECT/INSERT/UPDATE granted to the strict API role; the evidence worker gets no access. Startup verifies the required grants and RLS. Independent instances acquire a sixty-second lease through a row lock. Successful exact-window replay advances the checkpoint only while the same lease is unexpired and the starting checkpoint is unchanged. Failures retain the old coverage boundary; after crashes or expired leases, another instance repeats it. Earlier revocations may already have committed and will deduplicate on retry. Stale instances cannot overwrite the checkpoint or release a newer instance's lease.

`last_success` and `last_failure` timestamps are retained without raw provider errors or credentials. An operator must still select/install the cadence, monitor stalled or failing coverage, review initial and retention-gap coverage, and approve the hosted configuration. The method starts no timer or public route. A recorded boundary refers to successful selected-window queries; it does not guarantee provider event arrival beyond the configured overlap, complete retention history or current MFA policy.

PostgreSQL restore invalidation clears copied replay leases while preserving the historical boundary and the source database's state. Restored service gates remain closed; progress transactions require an active database and cannot authorize recovery activation. SQLite restored gates also deny claims and checkpoint advancement. Operators must reconcile post-backup provider activity before releasing restored customer access.

Validation: 31 WorkOS tests pass. Native session run `sa3f64b54b2ed` passes 22 groups, adding competing-pool lease acquisition, repository reconstruction, baseline replacement rejection, stale-owner denial, durable advancement and unscoped read isolation. Strict-role run `p9a36adc035e9` passes seven groups with the synchronized grant template. Recovery run `r5f3e250d2a58` passes 22 groups, including atomic clearing of restored leases while the source remains unchanged and explicitly approved legacy schema upgrades through migration 013. No live WorkOS replay or recurring schedule was run.

### Monitoring replay progress

`WorkosAuth.revocationStatus({maxLagSeconds?})` reads only the configured client's progress. The default lag threshold is 300 seconds; explicit thresholds can be 10–86,400 seconds. Results distinguish `uninitialized`, `never-completed`, `stalled`, `failure-observed`, `lease-expired`, `invalid-state` and `observed-fresh`. They expose observation/coverage/success/failure timestamps, lag and an active/expired/absent lease label, without client IDs, lease owner tokens, provider identities, credentials or event bodies. A failure timestamp equal to a success timestamp is conservatively reported as failure-observed because clock resolution cannot order those attempts. A later distinct success clears the warning in the observation; stored timestamps remain intact.

An operator can run `npm run governance:identity-status -- C:\absolute\private-status.json`. No provider key is needed and the command never calls WorkOS, starts services, replays events or installs a job. Configuration must be a bounded private regular JSON file. Common fields are `environment` (`dev`/`test`), `storage`, `clientId` and optional `maxLagSeconds`. For `postgres`, supply `databaseUrlFile` containing the private API-role connection URI and optional `caFile`; strict role grants, verified connection policy, migrations, environment and recovery gate are checked. For `sqlite`, supply an existing absolute `sessionDatabase` path; the file opens read-only and requires matching environment and an approved recovery gate when present. Mixed or unknown configuration fields fail. Missing SQLite progress reports uninitialized without creating a table.

Exit code 0 means `observed-fresh`, 2 means a valid non-fresh observation, and 1 means the observation failed. Errors are generic and do not echo database URLs, file paths or credentials. Observation freshness covers only the selected replay baseline, not complete event history, webhook delivery, MFA or release readiness. Before hosted operation, connect this command/report to an approved cadence and alert destination with a named owner and response procedure; none is installed by this increment.

Validation: 34 WorkOS tests pass, including state classification, malformed/future-state rejection, client-scoped read-only monitoring and the actual SQLite CLI with unchanged source bytes. Native session run `s997166a2a0e8` passes 24 groups, adding shared-PG status without stored-state changes, restored-gate denial and an actual child-process CLI against the strict API role without credential output. Temporary synthetic connection files were removed. The earlier migration/recovery/role checks remain valid; no schema or grants changed for monitoring.

### One-step operator revocation replay

`npm run governance:identity-replay -- --apply-revocations C:\absolute\private-replay.json`
performs **one** bounded, coordinated WorkOS Events API replay step. It can revoke
app sessions and stored renewal credentials, so the explicit flag and a private
configuration file are required. The file names `environment` (`dev`/`test`),
`storage` (`sqlite`/`postgres`), `clientId`, a canonical UTC `startAt` baseline
and an absolute `apiKeyFile` containing the WorkOS server key. SQLite mode needs
an existing absolute `sessionDatabase`; PostgreSQL mode needs an absolute
`databaseUrlFile` containing the strict API-role connection URI and may include
`caFile`. Keep keys and database URIs out of the JSON file, Git and command line.

The command checks the environment marker, recovery gate and existing SQLite
session/replay schema, or the PostgreSQL API profile, forced RLS, migrations and
session repositories, before replay. It fetches at most ten pages/1,000 events
in one selected window, validates the complete provider response before writes,
applies matching revocations idempotently and advances coverage only after a
successful window. Output contains aggregate counts and timestamps, without
subjects, session tokens, key values or raw events. Exit code 0 means advanced
or not due, 2 means another step holds the lease, and 1 means failure; a failed
step does not claim coverage. Keep the original baseline on retries.

One synthetic CLI test exercises a real SQLite customer session and event:
the matching session is removed, an unrelated session survives, the checkpoint
advances, and wrong-environment/restored-gate runs are refused. This does not
establish real WorkOS event delivery, PostgreSQL live replay, historical coverage,
an installed schedule or alert ownership. Those remain hosted release gates.

### Live read-only Events API checkpoint

`node --env-file=build/governance/dev/workos.env scripts/check-workos-revocation-feed.cjs --live-read-only` checks one past hour using the existing local key; append `--hours=24` for a bounded 24-hour window. It sends only authenticated fixed-origin GET requests, runs the replay parser with a nonpersistent no-op repository, and prints aggregate observations. It never opens a customer database, writes a revocation tombstone, revokes a provider session, publishes a transaction or installs a schedule. The explicit live flag is required; key values and raw event payloads are not printed or saved.

Two real HTTP checks on 29 September passed API access and empty-page parsing. Both the one-hour and 24-hour windows returned one page with zero events. Therefore no live nonempty revocation envelope, multi-page traversal, session invalidation or historical coverage was established. [Recorded aggregate evidence](validation/workos-revocation-feed-live-2026-09-29.json) distinguishes those observations from the synthetic unit/native acceptance. A controlled live customer session-revocation exercise and registered HTTPS webhook acceptance remain required before hosted release. Current event shapes are documented in [WorkOS events](https://workos.com/docs/events); reference fixtures alone do not establish live delivery.

## Customer app-session controls

Settings → **Your app sessions** lists recent access to the signed-in customer's account, including the current browser, start/last-seen times and pending renewal. It works before a workspace exists. Device names, IP addresses and locations are not collected or inferred. Each verified customer can hold at most twenty app sessions; both SQLite and PostgreSQL enforce the limit atomically.

`GET /v1/account/sessions` returns only that customer's currently valid app sessions. Public references are domain-separated SHA-256 values derived from stored session hashes; responses never include bearer tokens, stored token hashes, provider session IDs, encrypted refresh credentials or refresh-claim owners. API keys cannot use this account endpoint. Results are bounded and identity-version, idle and absolute-expiry checks still apply.

`POST /v1/account/sessions/revoke` accepts exactly `{ref}` as uncompressed JSON, limited to 4 KiB. Ending another session requires active authentication within five minutes, confirms the selected action in the portal and removes its saved renewal state in the same transaction. Caller identity/session authority is rechecked inside the transaction. Foreign and nonexistent references both return 404. The current browser must use **Sign out**, rather than this endpoint. A stale authentication check returns `reauthentication-required`; the portal clears the confirmation, directs the customer to sign in again and requires them to repeat the action themselves. It never automatically replays the deletion.

These controls end an **app session only**. They do not revoke the customer's WorkOS provider sign-in or any project API key. Provider webhooks/replay and key rotation/revocation remain separate workflows. No provider write or public deployment was performed for this feature.

Validation on 29 September: three new account-session tests exercise actual ephemeral SQLite sessions, isolation, credential/claim cleanup, the twenty-session cap and HTTP rejection paths. `npm run test:governance-workos` passes 37 tests. Native PostgreSQL run `s8d8457bf8bc2` passes 25 groups; the new group exercises strict-role HTTP account controls across independent pools and observes a PostgreSQL lock wait before signing out the caller, after which the pending deletion is denied and its target survives. Website build and 37 tests pass, including the cookie-derived account gateway, absence of workspace override, CSRF denial and reauthentication forwarding. The synthetic Edge fixture verifies the actual Settings component, inline confirmation and one rejected action without automatic retry; it contains no real credentials or customer data. Saved visual evidence is `build/governance/browser-acceptance/account-sessions-verified.png`, with normal/rejection accessibility observations alongside it. Real hosted shared-PG/WorkOS acceptance remains open.

## Human customer token boundary

The customer WorkOS callback and renewal paths now require a `user_` subject ID and, when the returned object's type is declared, `object: user`. Verified access-token claims may omit `sub_profile` (existing user-token compatibility) or declare `user`; `ai_agent`, unknown, null or malformed profiles are rejected. Delegated/impersonation `act` claims remain rejected. The existing issuer, client/audience, session, signature, verified-email, expiry and active-authentication checks still apply. This distinction follows [WorkOS Agent Auth's documented token claims](https://workos.com/docs/authkit/agent-blueprints): agent tokens can share user signing keys, so signature verification alone cannot establish a human customer principal.

An invalid callback creates no identity/session. If a rotating provider renewal returns an agent profile, the existing fail-closed renewal path removes that customer's app session and saved refresh credential. This does not alter the agent SDK's separate tenant-scoped API-key submission path. It is not an MFA guarantee or current provider-policy proof.

Validation on 29 September: 22 WorkOS tests pass, including signed wrong-profile callbacks, non-user IDs/objects, explicit-user compatibility and renewal cleanup. Native PostgreSQL run `s5827a28f63b4` passes 20 shared-session/HTTP groups, including rejected agent callbacks without session creation and human-session removal on agent-profile refresh across independent pools. Provider responses are synthetic; real WorkOS/shared-PG browser and required-MFA acceptance remain open. No WorkOS settings, customers or public services were changed.

## Evidence delivery observations — 29 September 2026

Overview now shows all accepted records in the selected project as Awaiting a batch,
Batched awaiting submission, Submission recorded and Other states. These counts
are independent of the reporting date selector. Acceptance age measures the oldest
pending/batched record from its server acceptance timestamp, not its last worker
attempt. Use Refresh for a new observation; no automatic polling is installed.
Missing delivery state is Other rather than disappearing from accepted totals.
These observations do not prove signature validity, Base confirmation, worker
liveness, customer coverage or an SLA. Inspect individual evidence for those
cryptographic and chain checks.

`GET /v1/evidence-status` requires project read permission, including a current
workspace session or read-capable project API key. The safe aggregate returns
`asOf`, `total`, `counts`, `awaitingSubmission`, `oldestAwaitingAcceptedAt`,
`oldestAwaitingAgeSeconds`, `verification: not-evaluated` and scope text. It exposes
no receipt/event IDs, bodies, keys, signer secrets or raw unknown state values.
SQL filters the selected tenant/project; PostgreSQL additionally uses forced RLS.
Count and oldest timestamps come from one grouped query. No migration or new grants
are needed. Empty projects return zero counts and null oldest age. Unknown/missing
state is not assumed to be pending or confirmed.

SQLite/HTTP authorization and missing-state tests passed; PG adapter checks verify
182 records with 3 batched and 179 pending. Seven native role-profile groups
(`p509044aea259`) additionally exercise the strict API role and foreign scope.
Website build/34 tests passed, including gateway selected-project propagation
without forwarding tenant overrides. Edge visual acceptance on synthetic responses
confirmed counts 2/1/5/0, 8 total and 120 seconds of pending acceptance age, with
explicit Base-verification boundaries. Proof is in
`build/governance/browser-acceptance/evidence-delivery-verified.png` and adjacent
text. This is not a live worker acceptance run. Aggregate performance on large
hosted projects, operational thresholds and automated alert ownership remain open.

## Invitation history and pending access — 29 September 2026

New membership mutation results also include `previousRole` and `role` (`null` for
removal); invitation acceptance includes `invitationId`. These results are stored
in the existing action-history transaction, without invitation plaintext. Replay
returns the original committed transition, which may differ from current access
after subsequent changes. Settings explicitly labels that as an original action
and reloads current members; it does not say that a replay changed access again.
Legacy records lacking this context remain unknown and use a generic notice.
No migration or historical backfill is performed. These administration records
are not cryptographically signed governance events and are not anchored on Base.

Audit-context acceptance passed eleven directory/session-lock tests and thirteen
native customer groups (`cd038b7d737a0`), covering promotion, demotion, removal,
historical replay without reapplication, accepted-invitation provenance and foreign
actor denial. Website build/33 tests passed, including replay-specific notices.

Settings now defaults to Pending invitations with 50-row pages, previous/next
controls and a count. All history, Accepted, Expired and Revoked filters expose
older offers without the previous latest-100 cutoff. Revocation of accepted
invitations does not remove membership; an owner changes member access separately.
Lists may move as invitations expire or are managed. A count is for the selected
workspace/status, not all organisations. The list error state no longer claims
that invitations are still loading after a failed request.

`GET /v1/workspaces/:id/invitations` accepts `state` (all/pending/accepted/expired/
revoked; default all), `limit` (1–100; default 50), and a safe nonnegative `offset`.
It returns `invitations`, `total`, `state`, `limit`, `offset` and `nextOffset`.
Duplicate selectors and invalid values return 400. Lists contain safe invitation
metadata only; token/hash/action bodies are absent. Owner/administrator access,
live session validation and tenant scoping still apply inside the transaction.
PostgreSQL counts and page rows use one statement/snapshot; SQLite uses its guarded
read transaction. No migration or new grant is needed. Legacy trusted repository
`invitations()` retains its 100-row compatibility wrapper; the HTTP portal uses
the paginated method.

Ten directory/session-lock regression tests, twelve native directory groups
(`c8427e26d8f84`) and nineteen native shared-session/HTTP groups (`s64252fd1dde7`)
passed. Shared fixture checks reconstruct all 106 original history rows without
duplication, find an older pending offer behind 104 revoked rows, distinguish an
expired offer and exercise accepted status, offsets, secret exclusion and foreign
workspace denial. Website build plus 31 tests passed, followed by four settings/
gateway tests including the new filter forwarding/duplicate rejection. Subsequent
Edge browser acceptance on the isolated synthetic fixture verified Pending by
default, all-history ranges 1–50/51–100/101–107, previous/next controls, accepted
filter offset reset, the older pending offer and its revoke control. An invitation
outage exposed an unrelated member list stuck in Loading; the UI now handles the
two responses independently. Rechecking showed member data preserved, an explicit
invitation error, and recovery with Refresh after restoring availability. Website
build and all 32 tests passed after the fix. Browser proof is in
`build/governance/browser-acceptance/invitation-pagination-verified.png` and its
adjacent text record. This fixture makes no real writes, creates no credentials
and uses no provider/network API. Hosted browser/identity acceptance remains open;
no public deployment or invitation email was sent.

## Local review workflow increment — 27 September 2026

The connected workspace now has a **Reviews** section and a decision investigation
view. It shows agent/model/deployment/configuration, recorded decision, case/run,
timing, linked review/outcome history and links to each record's receipt and Base
verification panel. Queue filters distinguish awaiting review, reviewed, needs
investigation, multiple outcomes and missing review metadata. Counts apply to the
selected date/search window, not the entire fleet. Linked history includes later
outcomes, so narrowing the run window does not hide later reviews.

Existing memberships remain read-only. Administrators may provision
`role: "reviewer"` on an individual workspace membership; absent role or `reader`
permits reads only. No existing VPS user has been upgraded. Role changes invalidate
existing sessions, as do other membership changes. Review permission does not
grant arbitrary event ingestion, wallet access or agent registration.

Reviewers can submit `correct`, `incorrect` or `needs-investigation`, with a bounded
rubric version. Correct reviews use the original predicted label; incorrect reviews
require a different expected-label code. Both require an existing case reference
and prediction. Investigation flags contain no accuracy label. There is no free-text
comment field or source-content upload. Review records are append-only and enter
the same atomic event/outbox and signed-receipt pipeline as other governance events.

The browser sends a stable request UUID and structured assessment only. Tenant,
project, event context, reviewer reference and timestamps are server-derived.
Reviewer references are `reviewer-` plus SHA-256 of the configured user ID; preserve
account configuration/history to resolve historical references. This is session
authentication, not a customer cryptographic signature, SSO or historical identity
attestation. `portal-review-*` IDs and the portal integration marker are reserved
at the ingestion HTTP boundary so project keys cannot impersonate that path.
Existing/imported human labels remain submitted assertions and are visibly separate.

Retries reuse the server timestamp of the first accepted record. A changed actor
or assessment with the same request UUID conflicts. The UI retains retry identity
for unchanged fields during the mounted review session; after navigation/reload,
inspect history before re-submitting an uncertain action. Separate reviews are
never silently overwritten or treated as corrections. Multiple outcome records
produce a conflict state and suppress accuracy under the existing report policy.
Conflict resolution/supersession, reviewer assignment, comments, notifications and
a production identity provider remain future work. Needs-investigation history
does not yet create an incident or an automated alert.

Endpoints: `GET /v1/reviews`, `GET /v1/investigations/:eventId`, and session-only
`POST /v1/reviews`. Mutations pass the same-origin gateway check and require reviewer
permission. POST bodies are capped at 4 KiB and reject unknown fields. Review queues
are paginated to at most 100 rows with scoped database counts and state filtering,
including offsets beyond 10,000. The raw-event scan cap is removed locally. A single
investigation history remains bounded to 10,000 linked records and fails explicitly
above that bound; history pagination remains future work.

PostgreSQL migration `004-review-links.sql` adds lookup indexes. SQLite adds matching
indexes during API startup. No new tables or privilege grants are needed. Rollout
requires a database backup, completed soak reconciliation, API/portal coordination
and explicitly provisioned reviewer memberships. The VPS and published website
have not been changed by this increment.

Synthetic preview: start `node scripts/run-review-workspace-local.cjs` (loopback
8796), build the website, then start it with `WORKSPACE_ORIGIN=http://127.0.0.1:3002`,
`GOVERNANCE_API_URL=http://127.0.0.1:8796` and
`npm run start -- --port 3002 --hostname 127.0.0.1`. Visit that origin's `/workspace`.
Local-only accounts are `reviewer@example.test` and `reader@example.test`, password
`Local-review-demo-only-123`. Never deploy these known synthetic credentials.
Preview records live in ignored `build/review-workspace`; no chain transactions
are broadcast and newly submitted reviews await a worker. This is an isolated
acceptance preview, not the VPS-backed workspace on port 3001.

Validation: 32 governance/framework tests passed in the full run, followed by all
four review tests (including one added concurrency/case-mismatch regression).
The website build and its 20 tests passed.
Coverage includes SQLite/PostgreSQL lifecycle, tenant isolation, role revocation,
same-origin protection, identity spoofing, immutable replay/conflict behavior,
report suppression and signed review proof verification. Browser acceptance also
confirmed saving a synthetic review, updated queue counts and pending evidence.

> Current baseline — 27 September 2026: [Platform current state](platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

## Delivered boundary

`/workspace` is the connected customer portal. `/portal` remains the public,
synthetic demonstration. The connected portal never falls back to the public
fixture when the private service fails. Both retain the product goal: ongoing
governance across model activity, outcomes and incidents, with source content
remaining in customer systems.

The website's same-origin `/api/workspace` gateway talks to the governance HTTP
service. Login creates a random opaque session; the gateway places it in an
HttpOnly, SameSite=Strict cookie. HTTPS uses Secure and the `__Host-` prefix.
Plain HTTP is allowed only for explicitly configured localhost development.
Session tokens are not returned to browser JavaScript or stored in localStorage.
Ingestion API keys remain separate from read-only portal sessions.

Every service request resolves the session and checks its selected workspace
against server-provisioned memberships. Tenant/project IDs come from that
membership, never the browser. Lists, detail, aggregates and exports all use
the same scoped store. Unauthorized workspace/event lookups return 404.

Sessions are stored as SHA-256 token hashes in SQLite, with 30-minute inactivity
and eight-hour absolute limits. Sign-out deletes the session. Reauthentication
rotates the current session. Changes to a user's configured password hash,
memberships or disabled flag revoke existing sessions when checked. Production
configuration changes require a service restart; there is no admin UI yet.
Login has durable per-account and global attempt limits (10 and 100 per 15
minutes). This bounds brute force but can cause temporary denial of service;
replace/augment with identity-provider and edge abuse controls before launch.

Passwords are stored as salted scrypt hashes (N=32768, r=8, p=3). The gateway
checks exact configured origin for mutations, bounds login bodies, refuses
upstream redirects, and sends private/no-store responses. The design follows
[OWASP session guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## Customer experience

Sign in → select an assigned workspace → choose a time window → inspect KPI
cards, daily activity, adjudicated model comparisons and submitted incidents.
Records are paginated from the live database, and detail is retrieved through
the scoped API. JSON reports include definitions and limitations. Refresh
reloads the database; this stage does not push updates or run automatic alerts.
Empty datasets, loading, expiry, service failure and denied access are explicit.
Changing workspaces clears prior records and cancels pending loads.

## Local acceptance setup

Run `node scripts/run-governance-workspace-local.cjs` with `PORT=8791` from the
root checkout. It creates a separate ignored database in `build/workspace-local`
and two randomly passworded local accounts. The ignored `local-access.json`
contains their credentials for manual sign-in. This file deliberately contains
plaintext **local synthetic-only** passwords: never deploy it or copy real
customer secrets into it. The regular service requires password hashes only.

The two accounts are Northstar and Harbour; their workspace names explicitly
say synthetic local acceptance. They contain different synthetic event sets
persisted in SQLite, not a static website JSON response. Dates are shifted at
first initialization so the records appear in a recent period. The fixture
does not refresh on subsequent starts; widen the date window if needed.

Website ignored `.dev.vars` (Cloudflare local runtime) and `.env.local`:

```text
GOVERNANCE_API_URL=http://127.0.0.1:8791
WORKSPACE_ORIGIN=http://localhost:3001
```

Run the website development server on port 3001 and open `/workspace`.
No existing VPS service or database is modified. Port 8790 may already be in
use; the acceptance service uses 8791 in this checkout.

## Provisioned service configuration

The standard `services/governance/server.cjs` accepts `GOVERNANCE_USERS` as a
server-side JSON array. Each record has `id`, `email`, `passwordHash`, optional
`disabled`, and `workspaces` containing `id`, `name`, `tenant`, `project`.
Use `passwordHash()` from `services/governance/auth.cjs` in a trusted provisioning
tool; never put plaintext passwords in that environment variable or source
control. A workspace ID is a selector, not an authorization secret. No users
are enabled by default. Existing `GOVERNANCE_CREDENTIALS` controls ingestion
separately and can be empty for a read-only service.

Set `WORKSPACE_ORIGIN` to the exact HTTPS portal origin and
`GOVERNANCE_API_URL` to the private service address for a hosted environment.
The current API binds loopback. Cloudflare deployment cannot reach a VPS's
loopback: a private authenticated service connection and hosting arrangement
must be configured before deployment. Do not expose the development API or
reuse the local acceptance accounts. Cookie sessions require an HTTPS origin
and request logs must redact Cookie, authorization and login bodies.

## Validation and remaining release gates

Automated tests exercise the real HTTP service and gateway with two customers:
sign-in, opaque cookies, CSRF rejection, forged workspace selectors, ignored
tenant overrides, foreign event lookup, reports, exports, read-only methods,
expiry, rotation, membership revocation, throttling and sign-out. Website route
tests cover the session boundary. Existing full TypeScript issues in the
explorer and Cloudflare ambient types remain separate, documented cleanup.

This completes the local authenticated-workspace increment. It is not an
internet-facing identity release. Remaining gates: managed OIDC/SSO and MFA,
invitation/recovery and admin lifecycle, production database/migrations,
hosting/residency and private transport, encryption/backup/restore, durable
quotas and audit logging. The local SQL reporting increment supersedes the former 10,000-event report cap;
output-cardinality limits and deployment gates are documented in the developer guide. Signed governance-event anchoring is now implemented and validated on Base Sepolia. Automatic tolerance rules and live heartbeat inventory remain separate development sets.

The local acceptance launcher rehashes its synthetic account passwords on
restart, intentionally revoking its previous sessions. For the regular service,
preserve configured hashes across restarts to retain unexpired sessions.

Final validation: 32 service/schema/receipt tests and 20 website tests passed;
production build passed. The browser confirmed sign-in, live KPI loading and
server-side event search. No VPS or public deployment was made.
