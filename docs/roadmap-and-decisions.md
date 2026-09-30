# Roadmap and decisions — updated 30 September 2026

## Current priority — production foundations and customer onboarding, 30 September

The SDK/integration pass is complete at local alpha scope; see [the audited SDK plan](sdk-integration-plan.md). The production-foundations/onboarding goal remains **active and incomplete**. Local implementation and synthetic/native validation do not establish hosted readiness. Staging and production startup remain hard-gated. Billing/checkout follows this package; website pricing is indicative.

For first-partner outreach, use the [design-partner pilot brief template](examples/design-partner-pilot-brief-template.md) to scope one workflow, synthetic records, named contacts and measurable acceptance. The owner-only marketing Site was refreshed to version 27 on 30 September. Its server gateways reject incomplete or malformed hosted portal/API origins, including IP literals and local-only names, before forwarding a session. Full Site TypeScript checking, the production build and 42 website tests now pass together in `npm test`; unused D1 starter/example files are outside the deployed Site typecheck. The hosted customer workspace still has no API connection. Do not issue partner credentials until the hosted synthetic-data acceptance gate in the brief is met.

Design-partner rehearsal follow-up: a standalone standard-library Python sample prepares a fixed, content-free three-record set for the brief's normal, unresolved and exception cases, submits that same saved set on every retry, and checks the three stored records with a separate read-scoped key. Local API acceptance proves three records, replay without duplicates, exact readback, altered-file denial, wrong-scope/read-only-key denial and redirect refusal. It has not been run against a hosted API and does not replace the partner's portal review, own integration or independent receipt check.

Hosting topology follow-up: the owner chose the existing VPS for the supervised synthetic design-partner pilot, subject to capacity and isolation checks, with separate managed PostgreSQL and backup storage. No new pilot VPS is selected. After the design partners and before onboarding paying customers, review long-term hosting and prove any migration, rollback and recovery path. Deployment-plan schema version 3 records application, managed-database and backup providers/regions plus backup account and operator references. Offline validation rejects a hosted backup provider shared with the application or database provider and a reused backup account reference. It cannot verify the real accounts or regions; database/backup provider, domain, residency and recovery decisions remain open.

Pilot portal address decision: the existing VPS has the provider hostname `vmi3235919.contaboserver.net` (forward/reverse DNS and read-only SSH confirmed on 30 September). The owner prefers it for the design-partner portal if it passes HTTPS, routing, frontend build, capacity/isolation and browser acceptance. No public 80/443 listener was observed; the current portal remains on the owner-only Site. The present plan and Site gateway require distinct portal/API origins, so a single-hostname layout needs a reviewed routing change or another valid API hostname. After design partners, the owner intends to buy an Orvessian domain, host the portal on its subdomain and migrate alongside the longer-term application architecture before onboarding paying customers. That future change requires DNS/TLS, callback, rollback and recovery acceptance; it is not part of the synthetic-pilot address claim.

Hosted edge follow-up: a synthetic `test` preflight checks the actual public HTTPS API route from outside after installation. It requires the governance API's bounded anonymous-session JSON response, internal health/readiness paths to return 404, and an unsigned webhook request to receive the configured app route's specific signature-required 401, all without following redirects. A generic proxy 401 or unconfigured webhook cannot pass. The unsigned probe changes no revocation state. Local tests pass, but no real API origin has been configured or probed; signed provider delivery remains open.

Revocation operations follow-up: one-minute systemd service/timer examples run the existing bounded WorkOS Events replay and separately check its coverage against a five-minute lag threshold on an isolated hosted `test` database. Their example identifiers are deliberately invalid until an operator sets the real client and reviewed replay baseline. Replay/status CLI tests pass; both untouched examples reject before reading credentials or contacting WorkOS. No timer, alert route or coverage monitor has been installed on a VPS. A target-host unit check, one manual live step, observed-fresh status, stale-coverage alert and controlled session-revocation exercise remain acceptance gates.

| Requirement | Implemented and evidenced | Required before completion |
| --- | --- | --- |
| PF-01 Environment separation | Dev/test state binding; full shared PostgreSQL control mode; separate strict API/worker grants; verified TLS outside loopback; offline four-environment topology validation | Check the existing VPS for isolated synthetic-pilot use; provision separate managed database and backup resources, provider/secret/wallet isolation, reviewed migration and release configuration. Reassess long-term hosting before paying customers. [Environment/release procedure](governance-storage-and-environments.md) |
| PF-02 Recovery and operations | Encrypted coordinated PG/journal captures; fresh-target source-absent restore; revoked credentials; selective customer-only recovery and separate private scoped worker approval/compensation/revocation commands; authenticated backup-set monitoring and verified archive re-encryption. Offline administrator checks admit database-owning `BYPASSRLS` non-superusers; a local managed-like role submitted a synthetic record, captured/restored it and reviewed pending evidence with the gate closed. Backup connections enforce verified TLS to remote hosts | The complete flow has not been accepted against a real managed PostgreSQL cluster. Prove full recovery there before hosting, then complete real provider/owner/account/custody/fee reconciliation, scheduled off-host custody/retention, recovery objectives, independent key custody/escrow and retirement, deployment/rollback rehearsal and monitoring ownership. [Recovery procedure](recovery-access-review.md) |
| CO-01 Managed identity | Live local SQLite WorkOS signup/sign-in/renewal; shared PG PKCE/refresh/session repositories; active reauthentication; signed replay-safe provider revocation; bounded authenticated missed-revocation replay with durable client-scoped leases/checkpoints and an explicit one-step operator command; exact verified-email admission list required for non-loopback WorkOS callbacks | Real WorkOS/shared-PG browser acceptance, configured named-participant list, required MFA/enrolment and IdP policy, account recovery, HTTPS webhook registration/delivery and installed/monitored replay coverage plus retention-gap handling. [Identity implementation](authenticated-customer-workspaces.md#one-step-operator-revocation-replay) |
| CO-02 Workspaces and members | Atomic workspace/project creation; verified-email invitations; owner/admin role limits; last-owner protection; live session/authority checks inside transactions; paginated invitation history; before/after administration results | Wider live membership/browser acceptance, reviewed control-plane migration and owner lifecycle/recovery. [Customer workflows](authenticated-customer-workspaces.md) |
| CO-03 API keys | Hashed scoped keys; one-time secret display; expiration/rotation/revocation; complete history filters; transactional authority/session checks; replay and lock-race tests | Required MFA/provider acceptance in shared mode, recovery activation and hosted deployment acceptance. [Key implementation](../services/governance/README.md#shared-postgresql-api-keys--28-september-2026) |
| CO-04 Portal onboarding | Live local owner workspace/key/first submission/revocation and independently verified Base Sepolia evidence; synthetic browser controls/reauthentication/invitation paging; project evidence-delivery observations | Complete real hosted shared-PG customer journey, recovery flows and release acceptance. Synthetic fixtures are not hosted proof. [Portal evidence](authenticated-customer-workspaces.md) |
| PF-03 Operational validation | Native tenant/role/session/key/recovery tests; bounded HTTP/pool/lock waits; readiness with privilege drift/draining; shared project/customer budgets and configured-client sign-in start capacity across processes; scoped delivery observations; replay status and private-file commands | Installed hosted resource/backlog/revocation alerts, per-IP/edge and other provider/pre-authentication abuse controls, hosted saturation and multi-host acceptance, sustained workload, independent restore drill and deployment acceptance. [Storage/native limits](governance-postgres-native-validation.md) |

Latest evidence: twenty-seven native shared-session/HTTP groups (`s823b631a7f19`, including two-process sign-in admission and customer/session/key authority checks), thirteen native customer groups (`cd038b7d737a0`), thirty-five native recovery groups (`r8dbf26da8666`, through migration 019 and coordinated publisher/operator recovery), twelve native strict-role/request-limit groups (`p828b089b1ce8`), seventeen service/transport/workspace tests, four readiness tests, twenty-seven worker/recovery tests, thirty-eight WorkOS authentication/session/webhook/replay tests, sixteen recovery/delivery tests, and the website build with 42 tests. Results live under `build/postgres-native/<run>/results.json`. Linked documents identify individual requirements and test scope; these counts are not a production-readiness score.

Independent export check: the offline record verifier now treats only a trusted signed receipt with matching record commitment, batch proof and current 12-confirmation Base Sepolia inclusion as a passing result (exit 0). Signed-only, submitted, confirming or unavailable evidence exits 2; invalid or untrusted evidence exits 1. It ignores the API's exported verification summary and bounds the input file. Synthetic tests pass, but the hosted shared-PostgreSQL first record still has no signed receipt or independently checked export. [Verifier procedure](governance-receipt-base-integration.md#operator-workflow).

Backup custody follow-up: an offline command now authenticates and copies a complete encrypted archive to a separate filesystem root, compares source/destination hashes, then authenticates the copy. A native managed-like test restored one synthetic record from that copied set and left it gated with pending evidence. This proves neither off-host custody nor a provider retention policy; actual separate storage and restore from its downloaded copy remain open. [Procedure](../services/governance/README.md#encrypted-coordinated-postgresql-backups--29-september-2026).

Object-storage follow-up: a private S3-compatible command now uploads encrypted archive objects with the completion marker last and downloads an exact key prefix into a fresh private directory, checking bounded sizes, SHA-256 and the authenticated archive. A local synthetic S3 round trip rejected altered object bytes and restored one record into a gated database. This has no live bucket, provider credentials, scheduled upload, retention policy or independent-host restore evidence. [Transfer procedure](../services/governance/README.md#s3-compatible-encrypted-backup-transfer--29-september-2026).

Remote backup-set monitoring follow-up: the private command can download and authenticate one exact object key prefix, report freshness and required journal coverage, and fail closed on altered bytes. An optional private pointer advances only after a completed upload, allowing a fixed monitor config to follow new sets while still checking the remote bytes. A new read-only bucket discovery command lists bounded completion-marker candidates if the original host's pointer is lost; those candidates are unverified until exact-prefix download. Synthetic acceptance covers intact, missing-worker-journal and corrupted-object cases plus discovery pagination and malformed listings. No scheduled monitor, alert route, authenticated provider inventory or real bucket check exists yet; a monitor result is not a restore drill. [Scope](../services/governance/README.md#s3-compatible-encrypted-backup-transfer--29-september-2026).

30 September native recovery check: the managed-like local PostgreSQL test passed a fresh encrypted backup, synthetic S3 upload, completion-marker discovery, exact-prefix download and fresh-target restore with the gate still closed. An incomplete object set was ignored and corrupted remote bytes were denied. The test cluster was stopped afterward. This is stronger local recovery evidence, but still lacks a real bucket and independent-host/provider restore.

Customer account controls: Settings now lists the customer's own app sessions, distinguishes the current browser and pending renewal, and lets a recently authenticated customer end another session with explicit confirmation. SQLite and shared PostgreSQL remove its saved renewal state atomically; foreign references are denied and concurrent caller logout prevents a pending deletion. The gateway keeps this account operation independent of the selected workspace. Provider sign-in and project API keys are separate, and no device/location telemetry is claimed. Synthetic Edge acceptance verifies confirmation and a reauthentication prompt without automatic replay. [Scope and validation](authenticated-customer-workspaces.md#customer-app-session-controls).

Recovery delivery follow-up: the offline full-journal review validates restored webhook envelopes, scope/routing references and delivery/lease state, reports uncertain work and unmatched bindings, and binds the review to the complete bounded snapshot. The linked rule review now checks historical definitions, assessments/digests, deterministic incident/alert/delivery links and lifecycle revision replay in the same snapshot. Fifteen delivery/rules/signature tests pass, including actual encrypted journal round trips and altered/missing-link denial. Source-event/evidence and cursor reconciliation, receiver acknowledgements, current key/ownership policy and post-backup activity remain independent requirements; no retry, lease reset or activation is performed. [Procedure and remaining checks](recovery-access-review.md#local-rule-incident-and-delivery-links).

Recovery evidence integration: the rule journal now compares original accepted observations and derived alert bodies against the restored PG database, recomputes historical assessments and verifies trusted recording signatures/commitments/Merkle proofs for referenced records. Native recovery run `rf08ec2f51df2` passes 23 groups; the delivery suite now passes 16 tests. Missing/altered/untrusted records fail, unsigned or uncertain acknowledgement work is incomplete, and concurrent journal drift rejects the review. Unrelated records require the separate full evidence review; positive SQLite rowid cursors require explicit migration reconciliation. Base inclusion, receiver acknowledgements, other journals, post-backup activity and final activation remain open. [Scope and evidence](recovery-access-review.md#rule-journal-against-restored-event-and-recording-evidence).

Recovery index follow-up: the deployed index is a disposable JSON cache, so the SQLite archive's generic indexer role does not establish its backup coverage. A new bounded read-only review checks its exact Base contract/start binding, contiguous checkpoints and cached maps against canonical range-log replay, with code, event-block, tip and file-drift checks. Thirteen indexer tests pass with synthetic RPC observations. Recovery should rebuild derived indexes from the reviewed start; attached manifests/evidence, live RPC trust, freshness and an approved restart remain separate. No cache, running service or archive format was changed. [Actual format and procedure](restored-worker-journal-review.md#disposable-base-index-cache-review).

Publisher recovery follow-up: the active product publisher is the SQLite-backed governance worker. The older capped-relayer class is a JSON-budget prototype referenced only by repository tests, not a required second launch publisher; any historical hosted use still needs deployment inventory and independent account reconciliation. The new offline current-policy spend review derives execution liability from signed bytes, checks stored reservations, signing times and rolling caps, and flags incompatible state without mutation. Thirteen worker/recovery tests pass, including a snapshot of an actual worker-created uncertain job. Actual total fees, timestamp provenance, wallet activity, canonical receipts and final release remain open. [Spend review and publisher inventory](restored-worker-journal-review.md#current-policy-spend-review).

Publisher runtime follow-up: every broadcast/retry rechecks saved signed-byte identity and exact batch binding against current fee/batch/reservation policy and rolling limits. Old signed work retains its replay liability after the signing window expires. PostgreSQL publisher authorization is checked at tick entry and immediately before send, so customer-only activation does not release the worker. Fifteen worker/recovery tests pass, including withdrawal during signing with zero sends and preservation of the signed retry journal. These checks do not atomically lock a subsequent external network send. Historical fee/account activity and hosted release remain separate gates. [Runtime behavior and validation](governance-automated-worker.md#policy-and-security).

Customer recovery follow-up: the offline dev/test transition now binds a complete bounded snapshot to the applied access selection, reconciles recording evidence and usage counters, checks strict API privileges, and rereads everything under exclusive locks before private audit plus `customer-active` commit. Fresh customer sessions/scoped reads work while old credentials and publishers remain denied. External provider/ownership/revocation/release references are operator assertions, not independent proof. Actual provider acceptance and final publisher release remain open. [Procedure and limits](recovery-access-review.md#customer-only-activation).

Repeated recovery follow-up: encrypted backups of a customer-active workspace now restore into a new generation, retain prior private audits/evidence and invalidate every captured credential again. Native acceptance covers a second access-review/activation/sign-in cycle with publishers still denied, refusal of missing prior audit and atomic rollback on invalidation failure. Migration 015 adds private lineage without runtime grants. In-place reinvalidation and unfinished-recovery captures remain refused. [Procedure](recovery-access-review.md#repeated-customer-recovery).

Combined publisher readiness: a new offline report joins signed-journal integrity, scoped PG evidence, canonical receipt observations, nonce activity and current spend policy. It works after customer-only activation, binds the database gate and rereads PG/journal state plus the pinned block to reject drift. Native recovery run `re6cb9c13885e` passes 28 groups; 15 worker/recovery tests pass. No blockers means ready for independent release review, with actual fees, post-backup activity, custody/ownership and other publishers still unverified. No repair, transaction or gate transition occurs. [Procedure](restored-worker-journal-review.md#combined-publisher-readiness).

Backup-key rotation: the offline dev/test utility and private-file CLI now re-encrypt authenticated PG/journal archives with a distinct replacement key, preserve source evidence and capture time, verify the new archive and reject nested output. Native recovery run `rbfaf98a8b6d6` passes 29 groups including actual new-key restore with access gated. Originals remain readable with the old key; rotation does not make a stale capture fresh or retire distributed copies/keys. Off-host custody, escrow, retention and key retirement remain open. [Operator procedure](governance-storage-and-environments.md#backup-encryption-key-rotation).

Recovery readiness fix: API/pilot PostgreSQL probes now accept `customer-active`, matching customer repository access; evidence-worker probes continue to reject it. Native run `r334a1b7dd99c` passes 30 recovery groups, including strict-role readiness after repeated activation, unactivated-state rejection and draining. Four readiness tests pass. This corrects an operational mismatch that would otherwise keep a reopened customer API unavailable to readiness-based routing. It does not release publishing or hosted startup. [Recovery behavior](recovery-access-review.md#remaining-activation-work).

Shared API request budgets: migration 016 and the updated strict API grants enforce independent read/write fixed-minute limits per tenant/project across API processes, hashed keys and scoped customer sessions. Two real loopback servers prove exact aggregate admission, 429/retry guidance and zero ingestion for denied submissions; independent pools prove forced-RLS isolation and policy/clock drift refusal. Native role acceptance passes nine groups, session/launcher acceptance 25, recovery acceptance 30 and service regression 17. Default limits are operational capacity controls, not pricing entitlements or proven throughput; provider/account/directory and pre-authentication edge controls remain open. [Configuration and scope](../services/governance/README.md#shared-project-request-limits).

Scoped publisher runtime enforcement: migration 017 binds a recovered-worker approval to the exact restore, tenant/project, database role, signer/recorder, contract code and spend-policy digest. Registry rows require a private review record, runtime roles cannot approve/revoke, and duplicate active wallets/projects are refused. Worker checks the journal release identifier against actual configuration before work and sending; repeated restore revokes captured approvals without changing the source. The launcher loads a bounded full reviewed journal binding read-only and checks actual configuration before constructing an RPC provider, then passes it to the strict PostgreSQL store. The private dev/test coordinator rereads a five-minute plan under PG/journal locks, commits the journal then PG approval, compensates uncertain commit outcomes and retains the owner lock on failed compensation. Scoped audited revocation denies runtime work without rewriting signed jobs. Private-file commands now prepare protected plans, require exact independent review input and revoke through the administrator connection; their read-only RPC transport requires verified HTTPS with method/redirect/size/time restrictions. Native recovery passes 35 groups, including real lock waits, lost commit responses, failed compensation, launcher admission and command acceptance; worker/recovery passes 27. Synthetic chain/review fixtures do not prove real independent approval. Actual custody/activity/fees, live RPC and hosted acceptance remain required. [Procedure](restored-worker-journal-review.md#private-file-operator-commands).

### Fresh provider check — 29 September

Full-goal review: local account/workspace/key workflows and scoped recovery are implemented, but the hosted requirements in the matrix remain unproven. Migration 018 now adds shared verified-customer read/write windows across sessions and project selection; the portal preserves bounded retry guidance without clearing the session or replaying mutations. Migration 019 adds a shared configured-client sign-in/sign-up/reauthentication start allowance before encrypted flow creation. Native tests prove exact aggregate admission, zero denied workspace/flow creation and preserved existing callback consumption across real loopback processes. This is a capacity fuse that can delay legitimate starts when exhausted, not per-IP bot identification or MFA proof. Authentication lookup, exchange/renewal, other pre-authentication endpoints and Internet-edge protection remain separate gaps. Hosting layout and required-MFA policy have been requested; neither is assumed. Next obtain real WorkOS/shared-PG journey and hosted operational evidence. [Controls and evidence](authenticated-customer-workspaces.md#shared-customer-request-controls--29-september-2026).

Customer onboarding follow-up: the API keys panel now supplies authenticated tenant/project references and a secret-free Python first-submission example, with retry and evidence-status guidance. Website build plus 35 tests pass. Executing the generated example against the loopback API with ephemeral hashed project keys proves acceptance/replay and denial of foreign, read-only and revoked credentials; actual redirect tests prove no request reaches the redirected endpoint, and oversized responses are refused. Edge visual acceptance passes on the synthetic fixture. Hosted API origin, real shared-PG/MFA browser acceptance and public release remain open. [First-record procedure](authenticated-customer-workspaces.md#from-a-project-key-to-the-first-record).

Customer identity follow-up: the WorkOS verifier now rejects agent/machine subject profiles and non-user response objects/IDs during callback and renewal. Twenty-two WorkOS tests and twenty native session groups (`s5827a28f63b4`) pass, including rejected callbacks and session removal on an agent-profile renewal. A fresh read-only Staging check still shows MFA Off; required-MFA and hosting-layout choices are pending. No provider setting was changed. [Identity boundary](authenticated-customer-workspaces.md#human-customer-token-boundary).

Read-only WorkOS MCP queries (`authkitSettings` and `webhookEndpoints`) against the configured Staging environment confirm email verification required, MFA **Off**, impersonation disabled and **zero registered webhook endpoints**. Recent verified `auth_time` does not prove an MFA factor or enterprise IdP policy. No settings, users or endpoints were changed. MFA/enrolment and hosted revocation delivery remain explicit gates.

Real read-only HTTP Events API checks using the existing local WorkOS configuration also pass authenticated access and empty-page parsing. The observed one-hour and 24-hour windows contain zero revocations; live nonempty event/session-invalidation and webhook-delivery acceptance remain unproven. The [aggregate evidence](validation/workos-revocation-feed-live-2026-09-29.json) records exact observation windows and limitations. No provider or customer state was changed.

### Next critical work and decisions

Shared-database browser preparation — 29 September: the local portal on `http://localhost:3001/workspace` now reaches the configured WorkOS staging sign-in page with the reviewed local callback. Aggregate inspection confirms the encrypted flow is in the fresh `dev` PostgreSQL database (one flow, zero identities before sign-in), rather than SQLite. Browser sign-in is awaiting the customer; callback, renewal, workspace/key lifecycle and evidence acceptance are not yet proven in this database. WorkOS/session regressions still pass 38 tests. The API/portal are loopback-only, with publishing disabled; no saved website environment or provider policy was changed. This supersedes the earlier stopped-service observation only while the current local processes remain live.

Shared-database customer acceptance — 29 September: the existing WorkOS customer completed the callback in Edge and the portal created `Local onboarding smoke test / Development acceptance`. Direct aggregate inspection of the dedicated `dev` PostgreSQL database at that checkpoint showed one identity, one active app session, one workspace, one project and one owner membership. The portal displayed the project and its authenticated key-management screen. A subsequently authorized one-day, write-scoped key accepted one synthetic event through the loopback API. The key was revoked in the portal; a fresh submission using that same credential returned HTTP 401. A database check found one accepted synthetic event, zero rows for the denied attempt, zero active keys and one revoked key. This proves the local shared-PostgreSQL first-submission and revocation path. Provider renewal, evidence-worker/Base processing, required MFA and hosted readiness remain unproven. No provider policy, customer email invitation, worker or Base transaction was changed.

Current-state receipt checkpoint later on 29 September: the first unscoped owner-role count returned zero because customer/event tables use forced row security. A privileged **read-only** aggregate check against the existing `governance_dev` database on port 55440 confirmed one identity, stored app-session row, workspace, project, membership, revoked project key, accepted event and pending outbox row. The strict API role independently saw the selected project's one record as pending evidence; there were zero evidence rows and zero publisher-release rows. Thus the earlier first-record acceptance remains persisted, while signing, worker release, Base Sepolia submission and independent export verification remain open. No worker job, release approval or chain transaction was created during this inspection.

Local shared-database preparation — 29 September: a separate persistent development cluster on loopback port 55440 now has fresh owner/API/evidence-worker roles and all nineteen migrations bound to `dev`. Both runtime profiles pass strict grants/RLS verification. The existing synthetic-only cluster on 55439 is not reused. The development launcher imports only existing WorkOS connection settings, uses a new private identity sealing key and starts shared PostgreSQL events/control/key storage with no seeded accounts, copied SQLite state or worker broadcasts. Actual startup acceptance passes `/health` and `/ready` (200) and unauthenticated `/v1/session` (401); the API and database were stopped after validation. This prepares real browser acceptance; it does not prove a customer journey or independent hosted/provider environment. [Local procedure](governance-storage-and-environments.md#persistent-local-shared-postgresql-development).

1. Complete operational recovery after the tested repeated customer-only transition: perform real independent provider/ownership/revocation acceptance and reconcile publisher/delivery work against external activity before using the separate dev/test publisher release commands. The [offline access-review and activation workflow](recovery-access-review.md) preserves revoked credentials and rejects stale state after actual lock waits. Read-only nonce observations do not identify transactions or enumerate post-backup activity. Never reactivate all backed-up memberships, sessions or keys.
2. Implement the selected [existing VPS application + managed PostgreSQL + separate backup storage layout](governance-storage-and-environments.md#selected-first-pilot-hosting-layout--29-september). A separate guarded `test`-stage shared-PostgreSQL API launcher, systemd template and HTTPS reverse-proxy example are prepared but uninstalled. Check capacity and isolation on the current VPS; prove a Node-hosted portal and HTTPS path on its provider hostname if using the owner's preferred pilot URL. Resolve the current distinct portal/API origin rule through a reviewed routing design or another valid API hostname. Choose database/backup providers, confirm independent failure domains, and record RPO/RTO, retention and operators before provisioning or scheduling. The provisional DigitalOcean managed-database candidate still requires an actual recovery drill. After design partners, buy the Orvessian domain, choose long-term hosting and rehearse portal subdomain/DNS/callback and service migration before paying-customer onboarding.
3. Complete the pending WorkOS MFA policy decision, then real shared-PG/browser onboarding and signed HTTPS revocation delivery. No public endpoint, outbound invitation or provider-policy change is implicit in a test run.
4. Rehearse hosted migrations, release/rollback, workload/alerts and independent restore. Enable hosted startup only through a reviewed release implementation and applicable authorization.

Credentials stay out of browser configuration, logs and signed governance records. Administration history is not automatically signed or anchored evidence. No recurring backup, off-host resource, public service or production deployment has been activated. Intermediate implementation notes are [archived](archive/roadmap-production-foundations-history-2026-09-29.md); use this matrix and linked evidence as current status.

Recovery evidence follow-up: the offline full-snapshot verifier now checks schema/scope/submission digest, recording signatures, signer trust, accepted-record commitments, Merkle membership and queue consistency. Twenty native groups (`rb05ec8204e51`) include a 102-record, two-scope paginated scan and refusal of a truncated review; five receipt/recovery regression tests pass. Unsigned pending work is explicitly incomplete. This is snapshot integrity only: Base inclusion, provider/ownership and publisher/delivery journal reconciliation remain required before service activation. [Procedure and limitations](recovery-access-review.md#offline-restored-evidence-reconciliation).

Provider recovery follow-up: selected disabled identities can now be checked through bounded read-only WorkOS user lookups and a final restored-state reread. Missing/unverified/mismatched accounts, outages and state drift cannot satisfy the binding review. Four unit tests and twenty-one native recovery groups (`re43f4e8c55cd`) pass with synthetic provider responses. Matched subject/email/existence is not ownership, MFA or revocation proof; real provider acceptance and final activation remain open. [Scope](recovery-access-review.md#current-provider-binding-review).

Worker recovery follow-up: [restored journal inspection](restored-worker-journal-review.md) now validates configured identity, actual signed transaction/hash/nonce/calldata/batch binding and conflicting nonces without broadcasting. The actual encrypted SQLite round trip retains signed bytes and the gate; five review/worker regression tests pass. Current chain/evidence/nonce reconciliation and rules/indexer/relayer review remain open. A historical confirmed job is not accepted as current inclusion or publishing permission.

Worker/evidence follow-up: the combined scoped PG/journal reviewer now verifies complete batches and every recording signature/proof, compares signed calldata and transaction links, and reports missing jobs or divergent histories. Optional bounded read-only RPC observations use the current Base verifier; no RPC means historical confirmation remains unresolved. Twenty-two native recovery groups (`r94946f8d4187`) include simulated canonical inclusion and journal-drift rejection. Actual nonce/post-backup activity, link repairs, other journal roles and live network restore acceptance remain required before release. [Scope](restored-worker-journal-review.md#comparing-worker-jobs-to-restored-postgresql-evidence).


## Earlier local delivery and integration evidence

The dated evidence below preserves the scope of earlier increments. Use the
current requirement matrix above for production-foundations status; earlier
test counts or an individual live receipt do not close hosted release gates.

The first real customer workspace's signed receipt and batch are confirmed on Base
Sepolia; signature, record commitment and membership checks passed. Ongoing local
publishing needs explicit operator approval and remains testnet-only with gas caps.
Earlier checks included six provider tests plus a combined control-plane suite (28 tests), and
the website build plus 27 website tests passed. Root dependency advisory check
reports zero after a targeted tmp 0.2.7 override, preserving solc 0.8.24; compiler
smoke and existing anchor artifact checks passed. This is not a full security audit.

Local provisioning acceptance includes five directory tests: provider-subject
identity, atomic/idempotent creation, fresh session permissions, cross-tenant
HTTP denial, invitation email/expiry/replay, restart and real website gateway
behaviour. Combined directory/environment/scheduler/key/workspace/route suite:
22 tests passed. Provider verification is supplied by trusted synthetic test code;
these tests do not prove WorkOS registration or live provider operation.
See [customer provisioning boundaries](../services/governance/README.md#customer-directory-and-provisioning--28-september-2026).

Follow-on phases: reconciled accepted-event metering and backend plan entitlements;
hosted checkout/billing/invoices and explicit plan-change semantics; controlled
design-partner pilot; public paid launch and a separate Base mainnet gate.
No duplicate retry, rejected submission, ordinary read or chain batch should become
another accepted-event charge.

Ecosystem integration update, 28 September: an MCP 2.2.0 customer-side call wrapper
now attaches configured tool status to an existing agent root without exporting
arguments/results or inflating model-run counts. Three isolated SDK tests and the
tenant API/signed-evidence round trip pass. It does not discover tools, open new
connections, grant permissions or retry customer calls. Real customer transport,
approval traces and broader providers remain open. [Scope](../sdk/python/README-mcp.md).

Evaluation integration update, 28 September: a narrow customer-side Langfuse
Scores API v3 categorical reader/converter now links explicit subjects to accepted
governance cases/events, excludes source/comment/author fields and preserves
immutable conflicts for changed vendor scores. Local HTTP → queue → tenant API
→ signed-evidence validation passes. Live vendor account, numeric/boolean scoring,
trusted reviewer provenance and polling checkpoints remain open.
[Scope and semantics](../sdk/typescript/README-langfuse.md).

Telemetry integration update, 28 September: actual Python OpenTelemetry SDK/API
1.45.0 exporter now maps configured parentless spans into the framework-neutral
durable queue, filtering source payloads before persistence. Real Simple/Batch
processor tests and the API-to-signed-evidence round trip pass; 24 Python tests
and both framework integration tests pass. Unset statuses, excluded scopes/children
and capture failures have local counters. Collector, GenAI/OpenInference mapping,
distributed-parent coverage and production throughput remain open.
[Mapping, privacy and delivery semantics](../sdk/python/README-otel.md).

Integration goal update, 28 September 2026: local Python wheel and Node package,
Node durable queue, strict acknowledgements, narrow OTLP mapping, normalized
automated-evaluation import and webhook-signature foundation are implemented.
21 Python and 9 Node tests plus the real framework/API/signed-evidence test passed.
Python now captures configured tools through actual framework callbacks, excluding
arguments/results and exposing mapping/limit gaps locally. Seven-wave status and remaining gates are
authoritative in the [SDK integration plan](sdk-integration-plan.md#current-seven-wave-delivery-status--28-september-2026).
Tool observations are configured metadata only. Collector plugins, named evaluation
vendors, automatic notifications and ecosystem breadth are not delivered. The
Review investigation and evidence views now present tool activity with explicit
coverage and enforcement limits; no observations is not presented as zero activity.
Rendered component checks, changed-panel typechecking and website build pass.
The webhook foundation now includes a persistent local delivery journal, bounded
runner, scoped destinations, pinned IPv4 HTTPS transport, retry/dead-letter and
lease recovery. Four tests pass, including local signed delivery, restart and
lost-acknowledgement deduplication. [Scope and remaining release gates](governance-webhook-delivery.md).
Versioned per-record rules now preview scoped records, preserve historical versions,
produce incidents/webhook jobs atomically, scan accepted SQLite records across
restart and publish linked downstream-monitor records to the signed-evidence path.
Incident acknowledgement/resolution/reopen history uses optimistic revision and
stable action identity. Nine rule/webhook tests pass. [Scope and gaps](governance-rules-and-incidents.md).
Tenant rule/incident APIs and portal controls are now implemented under explicit
SQLite journal opt-in, with governance-admin session permissions, server-derived
actors, scoped accepted-record preview and incident pagination. Existing users
and ingestion keys are not given administration access. Eighteen combined
API/session/review/rule/webhook tests, scoped panel typechecks and website build
pass. Interactive portal checks, PostgreSQL rules and scheduled processing remain
open. No package registry, external notification or VPS rollout occurred.

The performance checkpoints below remain valid for their measured workloads;
these new SDK tests do not establish sustained ingestion capacity or production readiness.

Five-minute mixed-load gate passed after freeing host RAM: 12,000 HTTP submissions
and 7,373 authenticated dashboard reads, zero errors, 22,020 reconciled primary
records. Varied model/task cohorts and deliberate conflicting labels matched the
independent reference report. Native backup/restore passed. Submission p95 was
13 ms and report p95 675 ms; sampled available memory stayed above 799 MiB.
[Evidence and scope](governance-postgres-native-validation.md). This supersedes
the earlier resource-stopped attempt below. Longer soak, saturation/recovery and
worker drain remain open; no VPS deployment or Base broadcast was performed.

Historical longer mixed-load attempt: the five-minute scenario's first
run stopped at the host-memory guard (about 207 MiB free versus 512 MiB minimum).
It is not a passed sustained test. Low-memory preflight and explicit resource stop
reporting were added; the subsequent retry passed as recorded above. See the
[stopped-run evidence](governance-postgres-native-validation.md).

Report performance upgrade completed locally: grouped outcome summaries and one
KPI pass reduced native mixed-load main-report p95 from 2,645 ms to 222 ms in
separate runs of the same scenario. All 600 submissions and 430 dashboard reads
passed; final 10,620-record reconciliation and backup/restore passed. No response
cache or new migration was introduced. [Evidence and limitations](governance-postgres-native-validation.md).
Next: longer bounded mixed-load validation with resource/backlog stop conditions
and more labelled cohorts before raising sustained-volume claims.

Native reporting concurrency gate passed locally on PostgreSQL 17.11: a 10,020-run
workspace accepted 600 additional HTTP submissions while four authenticated
dashboard clients completed 277 reads, with no errors or reconciliation gaps.
The original main-report p95 was 2.645 seconds and submission p95 110 ms; the
optimization above supersedes those timings. Native backup/restore passed with migration
005. [Measurements and limits](governance-postgres-native-validation.md).

Reporting scale increment, local: SQL aggregates and database review pagination
replace the raw 10,000-event scan limit in SQLite and PostgreSQL. Accuracy
eligibility, late labels and tenant isolation are preserved. Large incident lists
show a bounded preview with explicit totals. Tests cover 10,155 SQLite records
and 10,020 PostgreSQL-compatible records; this is not a sustained capacity claim.
See [limits, migration and validation](developer-guide.md#database-reporting-increment-27-september-2026).
The subsequent native migration/restore and concurrent dashboard/submission gate
is now passed as recorded above. Report performance work is complete at this
scale; a separately scoped sustained test with resource/backlog stops remains.

Capacity decision: test synthetic governance submissions rather than OpenAI
usage. A bounded local HTTP harness now covers pacing/concurrency, injected
throttling and uncertain acknowledgements, exact-payload retry, clean restart,
disk reconciliation and sampled signed receipts. The 200-record functional
recovery check passed; sustained capacity and VPS high-volume tests remain open.
See [commands, results and limitations](developer-guide.md#submission-capacity-harness-local-27-september-2026).
Before million-record product claims: validate the new indexed aggregation
under sustained load, test dashboard reads under ingestion,
measure database/resource growth and backlog drain, then run an isolated soak.
No paid provider load tests or new Base transactions are required for this gate.

Local product increment: CF-03/CF-05 now include the customer review queue,
decision investigation, session-derived reviewer identity, versioned rubrics and
immutable assessments connected to reporting and receipt verification. Existing
users remain read-only; reviewer permission is explicitly provisioned. Multiple
outcomes remain visible and suppress accuracy rather than being overwritten.
See [workflow and limits](authenticated-customer-workspaces.md). This is local
alpha, not a production identity release or VPS deployment. Next: review conflict
resolution/assignment and versioned rule preview, followed by alert/incident flow;
soak reconciliation and backup/environment gates still precede deployment.

Latest integration gate: one live OpenAI `gpt-4.1-mini` classification passed
through LangChain, scoped ingestion and signed receipt/batch verification locally.
The first attempt produced a failed run and a retry succeeded. This closes the
single-model live smoke gate; it does not close SDK-03 breadth, performance or
production release gates. No Base transaction or VPS change was made.

The active roadmap is the governance platform on Base. Historical own-PoW Phase 4 gates no longer govern launch; see [ADR-0009](decisions/0009-base-launch-settlement.md) and [current platform state](platform-architecture.md).

| Order | Work | Exit gate |
|---|---|---|
| 1 | Complete VPS reliability soak | Reconcile accepted events, receipts, batches, live anchors, errors and fees; no duplicate submissions |
| 2 | Daily governance workspace and evidence experience | Agent ownership/reporting coverage, decision KPIs, comparable outcomes and portal-wide verification states; see acceptance criteria below |
| 3 | Capacity and integration | Bounded index/journal scans, backpressure, rate ramps, batching evaluation and a structured-telemetry adapter |
| 4 | Governance workflows and repeatable reports | Versioned rules, alert delivery, incident ownership/resolution, saved views and scheduled scoped reporting |
| 5 | Customer readiness | Separate environments, production identity and roles, PostgreSQL rollout, managed keys, encryption and scheduled restore-tested backups |
| 6 | Partner validation and commercial release | Demonstrated investigation/reporting value, quotas/metering, cost evidence, support terms, security review and Base mainnet gate |

The 24-hour run is still in progress. Indicative website prices are authorised in the [commercial model](commercial-model.md); charging, data marketplace and production SLAs remain gated. Mining, ASIC compatibility and native-token allocation are not launch dependencies. Legal, manufacturing and vehicle views require explicit domain profiles and metric validation.

## Competitive feature backlog

Outcome increment: CF-03 now has Python submission of immutable linked outcomes
and explicit framework decision codes. Existing reporting excludes automated
labels from adjudicated accuracy and preserves sample/provenance gates. A portal
review queue and authenticated reviewer provenance remain to build. SDK-03 has
an OpenAI implementation tested through mocked HTTP; live validation still needs
a locally configured provider key/model. VPS deployment remains unchanged.

Framework increment, 27 September 2026: CF-01/SDK-02 now includes a real Python
LangChain/LangGraph root-invocation adapter, local durable delivery queue and an
API-to-signed-evidence integration test. The customer can correlate a framework
run UUID with its governance record without submitting source content. This is
local alpha using synthetic inference, not a live provider or production rollout.
Next integration gates: explicit outcome mapping, one live-provider compatibility
path, then OTel mapping; framework tool/handoff and approval events remain planned.
See [compatibility and acceptance](../sdk/python/README-langchain.md).

Implementation update, 27 September 2026: the first **local alpha** slice of CF-01/CF-02 now adds a synchronous Python ingestion client, tenant-scoped deployment registration, replay-safe heartbeats and an authenticated Agents directory. The client submits selected run metadata into the existing durable outbox/receipt path. Registration is immutable per agent/environment/deployment; changed configuration requires a new deployment reference. Registry metadata and heartbeats are operational signals, not signed or anchored evidence. This slice is not deployed to the running VPS soak. Retirement/history, production SDK packaging, TypeScript ingestion, framework adapters and automated discovery remain incomplete. See the [client reference](../sdk/python/README-ingestion.md).

Added 27 September 2026 from the [competitor register](competitor-research.md).
This expands work within the delivery order above; it does not bypass reliability,
capacity, customer-data or commercial release gates. P0 is the first partner
slice; P1 extends proven use; P2 is demand-led expansion. Status here is the
documented implementation baseline, not a fresh runtime check.

| ID / priority | Feature to create or update | Current position and competitive reason | Acceptance / dependencies |
|---|---|---|---|
| CF-01 / P0 | Supported SDKs and common telemetry mappings | Python ingestion and LangChain/LangGraph root-invocation adapters exist as local alphas; broader adapters are planned. LangChain/Langfuse/Arize make integration friction a buying factor | SDK-00–03 first slice in [integration plan](sdk-integration-plan.md); synthetic end-to-end import, retry deduplication, capture-boundary checks, receipt verification and published compatibility matrix |
| CF-02 / P0 | Agent/system inventory with owner, purpose, environment, deployment and last-seen status | Windowed reporting exists; ownership, heartbeat and inventory lifecycle planned. Credo/Holistic set discovery/registry expectations | Distinguish manually registered, reporting, stale and retired systems; configurable heartbeat expiry, missing-coverage labels and lifecycle history. No shadow-discovery claim |
| CF-03 / P0 | Outcome review, evaluator imports and operational metrics | Compatible labelled comparisons exist; evaluator provenance, review queue and explicit cost/latency coverage need expansion. Braintrust/Arize/LangSmith set expectations | Preserve evaluator/version, task/cohort, denominators, pending/conflicting labels; link reviewed outcomes to decisions. Cost estimates disclose rate/date/currency; no causal model ranking |
| CF-04 / P0 | Versioned governance rules, alerts and incident lifecycle | Submitted incident records exist; automatic detection, notification, ownership and resolution are planned. Fiddler and engineering platforms raise response expectations | Rule preview against synthetic history, deduplicated alerts, delivery status, severity/owner, acknowledgement, resolution/reopen history; separate submitted and detected sources. Depends on scoped access and SDK-09/10 |
| CF-05 / P0 | Investigation and evidence usability | Record-specific exports/checks exist; cross-tool correlation, saved filters and fleet verification summaries need extension | Trace-to-decision-to-outcome links, pending/confirmed/error summaries and independent export round trip; missing evidence remains visible. CF-01 plus capacity/indexing |
| CF-06 / P1 | Governance reporting, control mapping and reviewer workflow | Basic reporting exists; schedules, ownership/sign-off and policy/control mapping planned. Credo/Holistic/Fiddler compete for this budget | Versioned control references and reviewer actions; scheduled authorised reports with period, freshness and denominators; no automatic compliance certification. CF-02–05 and access/notification foundation |
| CF-07 / P0 release gate | Production access, privacy and operations | Pilot auth exists; production identity/storage/keys/retention not complete | Follow operations gates: environments, PostgreSQL, scoped roles, identity/MFA, key rotation, encrypted restore-tested backups, deletion/retention and audit history. SSO/SCIM breadth follows customer need; basic protection applies to all tiers |
| CF-08 / P1 | Evidence provenance and correction lifecycle | Recorder signature/anchor integrity exists; customer-source authority and historical authorisation remain future work | Versioned source identities/credentials, rotation/revocation context and linked corrections that preserve prior records; threat-model review. Explicitly distinguish submitted assertions, authenticated source and verified integrity |
| CF-09 / P0 before charging | Usage metering, budgets and transparent plans | Packaging exists; billing ledger/quotas and enforcement not implemented | Reconcile unique accepted events to invoices; no retry/rejection double charges; test caps/notifications and over-limit behaviour; align calculator, terms and website only after prices approved |
| CF-10 / P2 | Extended ecosystem and deployment options | Proposed integrations/domain profiles, not shipped products | Partner-backed SDK-04–12 rollout; support/upgrade ownership; private deployment/residency only after feasibility and cost validation. No blanket vendor compatibility claims |

### Build, integrate and defer

Build the shared governance workflow, record/evidence lifecycle and buyer-required
controls. Integrate existing tracing, evaluation results, ticketing and runtime
control observations. Defer a full agent runtime, prompt/experiment workbench,
model gateway, generic raw-trace store, autonomous enforcement and broad regulatory
certification engine. Reconsider only with demonstrated buyer demand, a costed
scope and an explicit change to product boundaries. This maximises useful feature
coverage while retaining a deliverable product.

First partner acceptance story: integrate a selected agent, identify its owner and
deployment, review a labelled outcome, investigate a rule-triggered exception,
record its resolution and independently verify the exported evidence. Features
still planned must pass their own acceptance checks before this story is marketed
as available. Track integration time, weekly reviewers, investigation time,
notification reliability and verification success against a partner baseline.

Weekly monitoring proposes changes; monthly product review records decisions in
this file using CF-/SDK- IDs. A competitor announcement alone does not change
availability or reprioritise a release gate.

## Decisions that govern delivery

| Decision | Position | Revisit when |
|---|---|---|
| Settlement | Application on Base; Sepolia during testing; no new L1/L2 | Measured batching/cost constraints justify review |
| Customer data | Bounded structured records; source content stays customer-held | No source-custody expansion is approved |
| Evidence | Recording-service signature, private proof and canonical anchor checks | Customer-source authentication and correction lifecycle are designed |
| Storage | SQLite synthetic pilot; PostgreSQL locally validated | Production migration and restore gates pass |
| Commercial | Subscription plus accepted-event usage; sponsored gas | Partner value, total costs and quotas are validated |
| Token/mining | Outside launch scope | Separate future business case, not an implicit dependency |
| Marketplace | Deferred rights/consent/privacy-gated discovery | Demand and lawful permissions are demonstrated |

[ADR-0009](decisions/0009-base-launch-settlement.md) records settlement rationale. Existing ADRs remain historical decision evidence; their original scope does not override this accepted launch direction. Detailed earlier portal proposals are retained in the [archive](archive/README.md) for unresolved design rationale. New decisions should update this register and add an ADR only when lasting rationale warrants it.

## Competitive product work packages — accepted 27 September 2026

Purpose: a daily governance and reporting workspace for AI/platform owners,
operations leads and evidence reviewers. Competitive positioning research is in
the [competitor register](competitor-research.md). CF-01–CF-10 above provide the
competitive traceability for these work packages, not a second delivery sequence.
Phase 2 covers CF-02/03/05 and CF-08 design; Phase 3 covers CF-01 and capacity;
Phase 4 covers CF-04/06; Phases 5–6 cover CF-07/09. CF-10 remains expansion.
SDK-00–SDK-12 in the [integration plan](sdk-integration-plan.md) refine Phase 3.
This is a prioritized build plan, not
a claim of feature parity with established vendors. Phases express dependencies,
not committed dates. Current pilot capabilities remain in the architecture guide.

### Phase 2 — activity, outcomes and evidence

- **Agent directory:** tenant-scoped identity, business purpose, owner, deployment,
  model/configuration version and last-seen event. Add an explicit heartbeat
  contract and stale/offline thresholds before showing “currently running.”
  Distinguish registered, reporting and stale agents; do not infer discovery of
  uninstrumented agents. Acceptance: synthetic cases for no heartbeat, delayed
  events, version changes and cross-tenant isolation show the correct state.
- **Decision metrics:** distinguish event, run and decision identifiers; count
  unique decisions, types, review outcomes and reporting coverage. Define time
  windows, deduplication, late events and missing values. Every KPI must explain
  its denominator and drill into the contributing scoped records.
- **Outcome comparisons:** versioned evaluator definitions, compatible cohorts,
  sample sizes, unlabelled/conflicting outcomes and human overrides. Add task
  success and supplied latency/cost only when their input semantics are defined.
  Missing cost is unknown, not zero; cohort differences are not causal claims.
  Acceptance: fixture reconciliation agrees between overview, detail and export.
- **Evidence experience (core differentiator):** show record integrity, trusted
  recorder signature, membership, canonical anchor, confirmation policy and check
  freshness separately. Pending/reorged/unavailable must never become generic
  green “verified.” Link each eligible decision to its export and verification
  instructions. Acceptance: an independent reviewer verifies a valid export;
  modified records/proofs fail, and RPC outages/reorgs produce explicit states.
- **Corrections and provenance:** design linked correction/supersession events,
  recorder key rotation and customer-source authentication. Preserve the earlier
  commitment instead of silently rewriting history. Define access and retention
  implications before implementation; signature trust must remain explicit.

### Phase 3 — integration and scale

Start with one supported Python/TypeScript integration for a partner workflow;
evaluate an OpenTelemetry adapter that allowlists structured governance fields
and excludes prompt/response bodies and source documents. Do not ingest full
traces by default. Validate redaction, schema versions, stable IDs, retry behavior
and tenant scoping with malicious/oversized inputs.

Bound reads and journal scans, introduce backpressure, and measure end-to-end
latency from acceptance through anchoring. Progress from reliability soak to
staged throughput ramps, then a separately budgeted 24-hour capacity run.
Measure API p95/p99 latency, errors, backlog age, proof completeness, duplicates,
storage growth and total fees. One million records/day averages about 11.6/sec;
that is a planning scenario, not demonstrated capacity. Agree burst targets and
pass/fail thresholds from baseline measurements before the capacity run.

### Phase 4 — rules, incidents and reporting

- Version rules and tolerance windows, with minimum samples, missing-data
  behavior, cooldowns and deduplication. Separate customer-submitted incidents
  from platform-detected breaches. Test noisy, delayed and conflicting inputs.
- Add acknowledgment, owner, severity, investigation notes and resolution history.
  Notification delivery needs retry limits, delivery status and scoped recipients;
  do not imply that sending an alert stops an agent. Runtime enforcement remains
  in customer systems; future connectors require a separate security decision.
- Add saved views and scheduled reports with frozen filters, metric versions,
  reporting timezone and evidence check timestamps. Recheck recipient permissions
  at delivery; exports must preserve tenant scope and disclose data gaps.
  Acceptance: repeat reports reconcile and revoked recipients receive no data.

### Phases 5–6 — trusted operation and customer validation

Environment separation, production storage, identity/roles, managed keys,
restore-tested encrypted backups and retention/deletion are prerequisites for
real customer data. Preserve these gates while improving the visible product.
Quota and consumption reconciliation must not double-bill identical retries.

Validate one support or purchasing workflow before expanding verticals. Measure
time to first usable report, integration effort, investigation completion/time,
repeat use and independent export verification. Establish success targets with
the partner before the trial; validate willingness to pay rather than assuming
dashboard usage proves demand. Legal, production-line and vehicle profiles follow
only with evaluated domain metrics. Mainnet remains a deliberate release gate.

## The evidence USP and its limits

Use **“AI governance with independently verifiable, blockchain-anchored evidence.”**
Signed records and Merkle proofs connect private evidence to cryptographic
commitments on Base. An authorised reviewer can detect alterations against the
checked canonical commitment without relying solely on the portal's display.
Make this visible in overview-to-decision navigation and portable exports.

Do not describe the whole stack as immutable: private databases can be changed
or lose data, software and keys can be compromised, and chain finality has a
defined trust model. Hash anchoring does not establish source truth, complete
capture, AI accuracy or safety. Preserve availability with backups/access controls,
and distinguish 12 L2 confirmations from Ethereum finality. The current pilot is
Base Sepolia. This differentiation is a customer-value hypothesis, not a claim
that all competitors lack equivalent evidence mechanisms.
# Node integration completion increment — 28 September 2026

The local Node alpha now builds structured outcomes and configuration observations
as well as runs. Both new record types pass API acceptance, immutable replay and
signed batch membership validation. Automated labels remain excluded from
adjudicated accuracy; the outcome builder directs human adjudication to the
authenticated review workflow. Configuration hashes are customer-declared,
not independent proof of runtime enforcement. Client API/tenant/project scope
is immutable at runtime. Twelve Node SDK tests and strict declarations pass.
See the consolidated [seven-wave integration status](sdk-integration-plan.md).
# Resumable evaluation imports — 28 September 2026

Langfuse categorical imports now commit each filtered page and its fixed-window
checkpoint atomically in the customer-side SQLite queue. Restart resumes the
saved cursor; capacity/collision/stale-writer failures leave state unchanged.
The checkpoint binds source/project/window/link/rubric/label configuration and
stores no vendor content or credentials. Local HTTP through this import path
reaches the tenant API and signed evidence. Fourteen Node SDK tests pass.
Scheduled polling, late arrivals, live partner validation and explicit score
revisions remain gates; completed imports do not imply vendor completeness.
# Opt-in rule processing — 28 September 2026

A bounded local processing loop now scans explicitly configured projects,
publishes detected alerts and reports sanitized per-project results. Cycles do
not overlap; failures remain scoped, cursors/outboxes recover, and shutdown
waits for active work. API startup requires explicit flags and never enables
webhook delivery; embedded delivery still requires trusted destination/key
configuration. Fifteen rule/API/processor/webhook tests pass. No VPS deployment,
external notifications or production configuration changed. Production monitoring,
PostgreSQL and browser workflow validation remain open.
# Installed Python framework acceptance — 28 September 2026

The Python wheel now has an explicit installed-SDK quickstart mode and acceptance
test. A copied example outside the checkout verifies module provenance, executes
actual LangGraph/tool callbacks, queues run/outcome records, and validates tenant
API acceptance plus independent signed receipt/batch membership. Source and
installed modes both pass. This closes installed quickstart validation; release
ownership/licence/support decisions, a clean dependency resolver check and broader
runtime coverage remain gates. No package was published or external API called.
# Python queue scope integrity — 28 September 2026

Python clients now expose read-only origin/tenant/project and transport limits.
The durable queue snapshots scope and rejects changes in custom clients before
enqueueing or each send, retaining unsent records. Its client/capacity are also
read-only, and transient memory queues are refused. These are accidental-change
guards, not process isolation; server tenant authorization remains authoritative.
Twenty-seven framework/client/telemetry tests, three isolated MCP tests and four
real source/installed-framework/telemetry/MCP API-to-evidence cases pass. The wheel
was rebuilt and installed for acceptance; no registry publication or deployment.
# MCP process transport acceptance — 28 September 2026

The existing MCP 2.2.0 wrapper now has real local stdio subprocess acceptance,
alongside direct/legacy in-memory tests. The test verifies distinct process
identity, original private results, protocol error status, absent inherited
governance credentials, content exclusion and orderly server exit. Both example
transport paths reach tenant API acceptance and independently checked signed
evidence while retaining one root/model-run record. Four isolated MCP tests and
two API/evidence cases pass. The caller-owned SDK opens the fixture transport;
the governance wrapper still opens no connections and launches no subprocesses.
Remote HTTP/customer deployment and approval tracing remain unvalidated. No
external MCP server, provider or blockchain transaction was invoked.
# Seven-lane integration development audit — 28 September 2026

The requested integration development pass now has implemented and exercised
increments in all seven lanes. The consolidated SDK plan records requirement-by-
requirement source/test evidence, current package hashes and remaining support/
release gates. Fresh checks pass: 56 governance/API/worker/integration tests,
21 Node SDK/schema tests, 27 Python tests, four separate MCP tests and 22 website
tests, plus website production build and strict Node SDK declarations.
PGlite tests are not native PostgreSQL deployment validation. Full website
typechecking still has the existing explorer/Cloudflare declarations failures;
interactive portal workflows and production readiness are not asserted. No
registry publication, deployment, new paid inference or external notifications
were performed. The next product phase should address pilot readiness and a
selected customer's integration needs rather than claim broad vendor support.

30 September follow-up: the website typechecking failure recorded in this
28 September audit is closed for the deployed Site application; see the current
priority section above. Hosted portal/browser acceptance remains open.
