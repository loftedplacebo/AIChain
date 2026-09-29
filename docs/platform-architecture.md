# Platform architecture and current capabilities

Local review increment: workspace sessions can carry an explicit per-workspace
review permission. The dedicated review API constructs immutable outcome or
investigation records from the authenticated actor and original decision, then
uses the existing atomic event/outbox transaction. Project ingestion cannot mint
portal-review identifiers. Linked-history indexes support the investigation view;
the bounded queue reports missing metadata and conflicting outcomes explicitly.
See [review workflow](authenticated-customer-workspaces.md). The deployed VPS
identity/storage baseline is unchanged.

The local LangChain/LangGraph adapter now adds a customer-side SQLite queue of
allowlisted root-invocation metadata. Explicit delivery feeds the existing scoped
HTTP ingestion/outbox/receipt path; no new event schema or blockchain contract is
needed. Source inputs/outputs remain in the customer's runtime. See
[framework boundaries and recovery](../sdk/python/README-langchain.md).

Local alpha addition (27 September 2026): tenant-scoped deployment registry and
heartbeat metadata are stored alongside governance events in SQLite/PostgreSQL.
The Python ingestion client submits selected run metadata through the existing
durable outbox; the workspace reads registered deployments through its authenticated
gateway. Registry/heartbeat state is operational and is not itself anchored. See
the [client and registry contract](../sdk/python/README-ingestion.md). This addition
has not been deployed to the running VPS soak.

Reviewed 27 September 2026. This is the current architecture and capability reference. Dated
experiment reports remain evidence for their original scope, not launch plans.

## Product and customer value

Orvessian is an AI governance workspace backed by independently checkable
evidence. Customers submit bounded structured UTF-8 JSON about selected agent
runs, model/configuration versions, decisions, outcomes and control observations.
They review activity, compare labelled outcomes, investigate exceptions and export
records with explicit verification checks. Receipts support the whole workspace;
the product is broader than a hash explorer or a single-receipt audit.

Source prompts, conversations, documents, media and raw sensor feeds stay in
customer systems. The platform stores accepted structured records and the private
receipt evidence needed to check them. Those records can still be sensitive.
Source-content custody is not an offered product line.

## What exists and where

| Surface | Actual scope | Availability |
|---|---|---|
| `/portal` | Generated synthetic governance demonstration | Website source; no private customer data connection |
| `/workspace` | Authenticated scoped reports, decisions, model comparisons, incident records and evidence exports | Local website connected by SSH tunnel to the private VPS test API |
| `/explorer` | Public Base Sepolia anchor inspection and optional local manifest checks | Read-only alpha; no private event mappings |
| `/products/governance-preview` | Product explanation and Evaluate/Operate/Enterprise indicative launch prices | Preview prices/allowances; no checkout or production SLA |
| `/product` | Explanation of the governance platform and its trust layer | Product messaging; capability status must remain explicit |
| `/status` | Dated readiness summary | Editorial snapshot, not live operational monitoring |

The website source is `C:/AIChain/website`, a separate repository. Editing it does
not publish a public site. The current customer demonstration runs at localhost;
the VPS API is bound to loopback and reached through SSH. No public onboarding,
production identity integration, customer deployment or mainnet launch is implied.

## Implemented testnet path

1. Authenticated API validates at most 64 KiB of structured JSON, scopes it to a
   tenant/project and writes the event plus outbox atomically. Identical retries
   reuse the accepted event rather than adding another event.
2. The recording service signs a salted commitment over the exact accepted event,
   including server receipt time. Its key attests the recorded bytes; it does not
   authenticate the originating customer model or agent.
3. The worker creates a private Merkle proof per record, batches up to 1,000
   receipts and saves exact signed transaction bytes before broadcasting.
4. A separate, limited-balance gas wallet sponsors Base Sepolia submission.
   Customers require neither ETH nor a token. A managed-service price remains
   distinct from the underlying gas cost.
5. The portal verifies commitments, trusted recorder signature, membership,
   chain/contract identity, matching batch event and current canonical block.
   Its 12-L2-block confirmation policy is not Ethereum finality or correctness.
6. The authorized export contains one record and its private opening/proof,
   rather than every record in the batch. Independent verification has passed.

Base is the launch settlement direction. The live implementation uses Base Sepolia
(84532); it is an application on Base, not a separately operated Orvessian L2.
Own-L1/PoW, mining incentives, ASIC plans and a native token are outside the launch
critical path. Historical consensus experiments are retained, not release gates.
Hierarchical batching remains a capacity option to evaluate, not a shipped feature.

## Operational evidence and limits

The supervised VPS worker, API, earlier ingress and indexer are running. Tests
have covered graceful restart, forced process termination, stale-lock recovery,
RPC outage with queued records, automatic recovery, duplicate prevention and live
canonical confirmation. The local wallet launcher is disabled after migration.
One wallet, one journal and one worker owner are required; multi-host active-active
relay is not supported. The portal tunnel depends on the laptop connection.

SQLite is the deployed synthetic test store. The PostgreSQL adapter, row-level
security and native backup/restore/restart checks passed locally; production
PostgreSQL migration and scheduled encrypted backups are not deployed.
The deployed baseline limits reports to 10,000 events. The local reporting
increment removes that raw-event cap using scoped SQL aggregation and paginated
review queries; it has not yet been rolled out to the VPS. The worker serializes
in-flight transactions and rescans journal jobs; high-volume work is still needed.

The 24-hour soak concluded. A read-only VPS audit on 28 September found a
completed checkpoint: 2,400 accepted, zero errors/duplicates, maximum API latency
320 ms. All 2,400 synthetic soak records have signed evidence; all 41 worker jobs
are recorded as confirmed, with none unresolved. The generator is inactive after
successful exit; API and worker remain active. This is sustained reliability at
100 records/hour, not a throughput benchmark or a fresh independent verification
of every historical chain anchor.

## Reporting and safety claims

| Supported statement | Important boundary |
|---|---|
| Agents reporting in a window | Not a heartbeat-based count of agents currently running |
| Accuracy among compatible adjudicated outcomes | Not intrinsic model accuracy; show denominators, pending/conflicting labels |
| Differences between deployment cohorts | Descriptive; does not prove switching the model caused the difference |
| Submitted incident/control records | Not automatic anomaly detection, alert delivery or runtime containment |
| Record matches a signed commitment and checked anchor | Not true/complete capture, source authentication, lawful behavior or AI safety |

Future domain views may group legal work by case type, robotics by production
line and vehicle activity by vehicle. These require domain profiles and evaluated
metrics. Configurable tolerances, automatic rules, notification delivery, incident
workflows and historical source-authority verification remain future increments.
Narrow ZK policy-proof research exists separately; the current governance pipeline
does not prove model inference or attach a ZK proof to every event.

## Planned integration boundary

The [SDK integration plan](sdk-integration-plan.md) and [competitive feature
backlog](roadmap-and-decisions.md#competitive-feature-backlog) describe planned
extensions alongside locally tested alpha interfaces. A common structured-event contract will
support customer-side telemetry mapping, external trace references and evaluator
provenance. Python and Node ingestion are locally packaged alphas; inventory and
heartbeats exist, and customer-side OTLP/normalized evaluation mappings are narrowly
tested. Local versioned per-record rules, incident transitions and webhook journal
now exist, with opt-in tenant APIs and portal controls restricted to governance
administrator sessions for mutations. They are not enabled on the VPS.
[Rule provenance and limits](governance-rules-and-incidents.md) and
[delivery gates](governance-webhook-delivery.md) describe this boundary. Named
vendor connectors, collector plugins, production rule/incident APIs and delivery,
scheduled reporting and commercial metering remain planned.
See the current [seven-wave integration status](sdk-integration-plan.md#current-seven-wave-delivery-status--28-september-2026).
Prototype validation/receipt utilities and the existing generic HTTP API
must not be marketed as a published multi-provider SDK. Customer-side filtering
must keep source content out of transport, logs and stored records.

## Commercial direction

Proposed model: monthly/annual workspace subscription with included accepted-event
usage and measured overages; capped evaluation tier subject to abuse controls.
Evaluate/Operate/Enterprise are packaging hypotheses. Indicative website prices
and allowances are in the [commercial model](commercial-model.md); production
pricing validation, retention and SLA commitments remain open. Record count is not model-run
count or chain-transaction count. Gas is sponsored within the service economics.

Later usage-intelligence/marketplace ideas require explicit rights and consent,
privacy testing, aggregation rules and independently useful demand. They are not
a license to resell customer records and are not implemented. Token exchange or
scarcity strategies are historical secondary research, not this business model.

## Delivery order and release gates

Current priority: the integration development pass is complete locally. The
authorised next package is environment/operations foundations plus managed
customer identity, workspace/project provisioning and scoped API-key management.
See [current delivery sequence](roadmap-and-decisions.md#current-priority--production-foundations-and-customer-onboarding-28-september).
Configured accounts/credentials are not self-service signup. The key-management
API and portal controls are a tested local increment: authenticated workspace
administrators create project-scoped hashed credentials, rotate and revoke them.
One-time secrets appear only for deliberate copying in temporary component state.
Managed-identity onboarding and shared production control-plane storage remain open.
An explicit dev/test PostgreSQL key adapter now shares hashed credentials, action
history, rotation and revocation across API connections. Project mutation locks and
RLS prevent limit/idempotency races; native acceptance also covers authentication
waiting on concurrent revocation. The generic launcher requires migration 006 and
optional key grants to select it. Identities/memberships/sessions/OAuth flows remain
SQLite; this is not yet a multi-instance customer identity topology. No automatic
key migration or production deployment occurs.
Migration 007 now adds a PostgreSQL customer directory adapter with forced RLS,
identity/workspace locks, hashed invitations and atomic provisioning/action history.
Ten native two-pool acceptance checks passed, including a transaction-level API-key
membership guard that observes role revocation after a lock wait. Migration 008 now
adds shared hashed sessions and encrypted PKCE/refresh state. The dev/test launcher
supports explicit PostgreSQL control storage with WorkOS, transactional key checks
and no SQLite session fallback. Eleven native session/HTTP checks passed. The live
customer remains on SQLite; real provider/browser acceptance on PostgreSQL and
complete encrypted recovery orchestration are required before migrating that workspace.
Migration 009 now gates restored PostgreSQL state. Offline fresh-target invalidation
erases sessions/flows, revokes keys/invitations and disables identities while preserving
governance evidence and ownership history. Event, key and directory/session adapters
refuse blocked restores; read-only review does not activate them. Five native recovery
groups passed, including forced rollback and signed-evidence verification. On-demand
encrypted PG backups and journal coordination are now implemented at local dev/test
scope: authenticated AES-GCM dump/manifest plus encrypted SQLite journals, validated
before fresh database creation. Eleven native recovery groups passed, including
source-absent restore with signature/commitment/Merkle verification and an archive
integrity/freshness inspection command that creates no PostgreSQL database.
Off-host scheduling/retention/PITR and reviewed activation remain unfinished.
The local customer directory now persists provider-subject identities, workspaces,
projects, memberships and manual invitations. Trusted server code alone creates
verified identities and sessions; browser assertions are not accepted. Tenant
permissions are reloaded on every customer request. Owner-only membership changes
protect the final owner. The customer Settings view connects workspace/project
creation, manual invitations and member controls to the API/gateway and reloads
session/project choices after changes. First-time customers start in Settings.
WorkOS authorization-code integration and the browser callback gateway are now
implemented behind explicit server configuration and tested using signed synthetic
JWTs and real hosted signup/sign-in. Local customer workspace/project/key creation,
first submission and portal visibility have passed browser acceptance. Requests
renew provider access using AES-GCM encrypted rotating refresh credentials; browser
cookies contain only an opaque application session. Rotation is consumed durably,
coordinated by durable owner-bound claims across local SQLite connections and
never revives a revoked session. An abandoned claim cannot replay the consumed
credential. Provider state now has an asynchronous persistence interface; its
PostgreSQL implementation and shared customer directory are now available through
explicit dev/test control-storage selection. Eight-hour
absolute and 30-minute idle session limits remain. PostgreSQL renewal coordination
passed native two-pool acceptance; shared recovery, provider revocation events and
MFA step-up remain release requirements.
The isolated customer's recording-service receipt and Merkle batch have also passed
canonical Base Sepolia verification. These checks attest record integrity/inclusion;
they do not certify source completeness, model correctness or Ethereum finality.
Production startup is still gated.
Session revocation now has an opt-in signed server webhook. SQLite and PG adapters
persist client-bound revocation tombstones and idempotent event digests with matching
session deletion. Tombstones deny delayed callbacks; shared event failures roll back
session deletion. PG migration 010 adds forced-RLS event tables and scoped session
deletion policies. Fourteen native session/HTTP groups passed. The route remains
loopback-only; WorkOS endpoint registration, real delivery/backfill and MFA step-up
are not complete. Migration 011 now stores verified active authentication time.
WorkOS-backed key/workspace/invitation writes require it within five minutes;
refresh does not advance it. Stale sessions retain reads and the portal offers
same-customer active sign-in before manual retry. Fifteen native session/HTTP
groups and the website build/tests passed. Live reauthentication/browser acceptance
and required MFA still need provider policy/enrolment validation.
The generic launcher now binds local SQLite state to dev/test environments and
rejects mismatches; staging and production startup remain gated.
Local recovery now captures explicitly quiesced SQLite state into AES-256-GCM
encrypted bundles with authenticated manifests and verified restore. Restores use
a new private directory, preserve governance evidence, invalidate restored access
and gate API/worker/delivery activation. A read-only operator review checks all restored
files, environment/integrity, disabled identities, revoked credentials and gates;
passing does not activate services or reconcile provider/chain state. PostgreSQL control-plane recovery, live
scheduling, off-host retention and reviewed activation remain production requirements.
Billing/checkout follows those foundations. The sequence below retains earlier
operational gates; successful synthetic soak results do not remove production gates.

1. Finish the current soak; reconcile event totals, proofs, jobs, fees and failures.
2. Improve portal-wide pending/confirmed/error summaries and bounded indexing.
3. Exercise representative capacity ramps and larger/hierarchical batching without
   inferring million/day capacity from a 2,400-record reliability run.
4. Build configurable governance rules, alerting and incident lifecycle with clear
   submitted-versus-detected attribution; validate one design-partner workflow.
5. Separate dev/test/prod; deploy production storage, identity/SSO/MFA, roles,
   managed keys, encrypted backups with restore drills, retention/deletion controls,
   metering, quotas and measured operational budgets before real customer data.
6. Review security, contracts, support, price/allowances and release evidence before
   public paid access or Base mainnet. Keep the production rollout explicitly gated.

## Evidence and operating references

- [VPS portal and soak](governance-vps-portal-and-soak.md)
- [VPS worker and recovery](vps-governance-worker.md)
- [Worker architecture](governance-automated-worker.md)
- [Receipt integration](governance-receipt-base-integration.md)
- [PostgreSQL validation](governance-postgres-native-validation.md)
- [Base settlement decision](decisions/0009-base-launch-settlement.md)
- [Documentation review and inventory](archive/2026-09-27/superseded-plans/documentation-review-2026-09-27.md)
