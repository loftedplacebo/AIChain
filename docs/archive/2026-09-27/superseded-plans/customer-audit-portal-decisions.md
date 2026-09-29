# Customer audit portal: architecture decisions and decision register

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](../../../platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

Status: proposed architecture for discussion; no production customer evidence
storage or customer receipt workflow is deployed. Updated 2026-09-26.

## Product outcome

The portal is an ongoing AI governance and monitoring workspace; a receipt is
one evidence item in the customer's longer history. A customer should be able
to see fleet-level activity and follow an individual business decision
from the request that triggered it through model and configuration identity,
retrieved context and tools, policy and
human review, the resulting action, corrections, and independent integrity
checks. It must show the evidence and the limits of each check, not just hashes
and not a generic green “verified” badge.

The portal should accept bounded structured governance data for useful
longitudinal reports without requiring full customer conversations. Detailed
collection, metric and database design is in [Governance analytics portal
architecture](governance-analytics-portal-architecture.md).

The portal can validate that disclosed bytes match a commitment, that a signed
record was signed by a named key, that receipt links and sequence rules are
consistent, that a receipt belongs to a committed batch, that the batch matches
a canonical Base event, and that a specified deterministic policy proof
verifies. Those checks establish integrity, provenance and explicitly defined
claims. They do not independently prove that a provider ran the named model,
that the captured history is complete, or that an output is correct or safe.
Those stronger claims require trusted instrumentation/attestation, independent
observers, a defined proof statement, or other external controls.

## Current baseline

- **Settlement direction:** Base, beginning with Base Sepolia; this is an
  application on Base, not an AIChain L2, private L1, or miner network
  ([ADR-0009](../../../decisions/0009-base-launch-settlement.md)).
- **Data boundary:** private evidence inside the customer’s security boundary;
  public anchors contain commitments and minimal checkpoint metadata
  ([ADR-0002](../../../decisions/0002-organisational-verification-ledger.md)).
- **Anchor hierarchy:** receipt → Merkle batch → signed checkpoint → Base
  anchor. Larger flat batches should be measured before introducing hierarchy.
- **Receipt format:** the 0.4.0-alpha general receipt is an implemented local
  reference format, not a stable production protocol. It binds evidence
  descriptors and opaque subject/event identifiers; it does not parse AI
  traces, authenticate provider claims, or manage evidence storage.
- **Proofs:** RISC Zero is selected for the initial, narrow policy-evaluation
  statement. This does not prove frontier-model inference or output correctness.
- **Indexer:** a durable, reorg-aware Base Sepolia indexer exists on the VPS.
  It indexes public anchor/checkpoint facts. It does not hold customer
  manifests or source evidence.
- **Website:** the explorer can inspect public Base Sepolia anchors. Its alpha
  receipt-membership flow takes a manifest from the user's browser. There is no
  customer tenant, authenticated evidence API, customer model registry, or
  configured production D1/R2 evidence store.
- **Synthetic ingress:** the VPS load-test service retains synthetic
  presentations and queue state. This is test data, not a customer vault or a
  production customer submission path.

Therefore, today the answer to “where is customer off-chain evidence held?” is:
it is not held by this product. The indexer stores chain-derived metadata; the
browser-local manifest check does not upload the manifest; and the VPS queue is
limited to synthetic test records.

## Recommended decisions

| ID | Decision | Recommendation | State / when |
|---|---|---|---|
| PORTAL-001 | What is the product? | One tenant-scoped governance portal for agent/model inventories, aggregate reporting, decisions and incident timelines, policies/configurations, alerts, evidence and anchor verification, and portable auditor export. | Founder direction established; deliver as phased product. |
| ARCH-001 | Settlement and node operation | Keep Base as the settlement layer. Use reliable paid RPC with independent fallback/observation. A self-hosted Base node is optional operations work, not a customer requirement or consensus system. | Agreed direction; re-open only with cost/reliability evidence. |
| DATA-001 | Evidence custody | Customer submits bounded structured JSON telemetry, references and commitments through the API. AIChain never accepts or stores source prompts, transcripts, documents, retrieved content, media or raw sensor payloads. Those remain in customer systems. | Founder direction established; enforce in API and storage design. |
| DATA-002 | Hosting boundary | Do not place raw AI evidence on Base. Keep public roots and minimal anchor fields on Base; keep searchable private metadata and manifests encrypted/access-controlled off-chain. | Direction agreed; exact hosting choice depends on DATA-001. |
| DATA-003 | Evidence disclosure | Role- and case-scoped access, explicit field-level redaction, expiring share links or auditor packages, customer approval for disclosure, and auditable access events. Never use hashes as a substitute for evidence. | Decide now at product-policy level; detailed authorization design before implementation. |
| DATA-004 | Retention/deletion | Customer-defined per evidence class, with legal hold and verified backup expiry. Delete private bytes and encryption keys under policy; retain only public anchors and a deletion/tombstone statement where required. Explain that public-chain data cannot be deleted. | **Must be resolved before production data.** |
| AVR-001 | Canonical receipt | Evolve 0.4.0-alpha into versioned profile-based receipt; separate stable envelope from profile-defined AI execution fields. Pin exact profile and schema digests in each receipt. | Resolve before production API; preserve alpha fixtures. |
| AVR-002 | Canonical bytes and identifiers | Publish deterministic canonicalization and domain-separated IDs; reject ambiguous encodings. Define exact-byte evidence encoding and supported media/profile validation. | Resolve alongside AVR-001. |
| AVR-003 | Commitments and privacy | Keep current salted commitment concept only after a reviewed construction, salt custody/recovery plan, and low-entropy guessing analysis. Hashes are integrity bindings, not encryption or confidentiality. | Cryptographic review before stable protocol. |
| AVR-004 | Issuer and trust | Separate receipt author, execution observer, model provider, policy evaluator, reviewer and gas-paying publisher. Sign claims with key identifiers and record authorization/revocation history; never imply the anchor publisher authored the AI result. | Minimum trust model before API pilot. |
| AVR-005 | Time | Record source clock and claimed execution time in signed evidence; separately show chain inclusion time and observed finality. Specify skew/uncertainty and trusted timestamp options by profile. | Resolve before stable receipt. |
| AVR-006 | Anchor and finality | Bind chain ID, contract, batch ID/root/count/schema, transaction, block hash and canonicality observation. Define confirmation/finality policy and reorg repair behavior. The portal must show “included / currently canonical / confirmation policy met” separately. | Base testnet path exists; production thresholds and contract release gate remain. |
| AVR-007 | AI evidence profile | First profile should be enterprise AI decision/execution: model/provider/version, deployment or artifact digest when available, runtime/config, prompt-template and input/output commitments, tool/RAG lineage, policy evaluation, human decision and outcome/correction links. | Design now; schema and SDK build next. |
| AVR-008 | Model registry | Customer-managed registry of declared model deployments and configuration snapshots, with immutable version IDs and change history. Integrate provider attestations when available; label self-declared data clearly. | Build with portal, initial MVP can import signed registry records. |
| ID-001 | Customer/agent identity | Tenant identity plus distinct service identities for agents, gateways, evaluators and human reviewers. Keep opaque identifiers in public commitments. | Define in customer API design. |
| ID-002 | Key lifecycle | Per-tenant signing keys, rotation, revocation, delegated roles, recovery and historical verification; isolate transaction relayer keys from evidence-signing keys. | Before pilot with customer data. |
| SCALE-001 | Batching | Durable idempotent queue; measure larger flat batches first, then hierarchical checkpoints if batch size/latency warrants it. Priorities change queue scheduling, not truth or verification strength. | Load/cost gate before public testnet scale claim. |
| SCALE-002 | Capacity targets | Define separate SLOs for accepted, sealed, submitted, included and finality-observed records; target millions/day only after payload, RPC, storage, cost and backlog simulation. | Decide after realistic benchmark profile. |
| API-001 | Submission and status | API returns durable receipt/case ID and idempotency key immediately; status states: accepted, evidence-pending, sealed, batched, submitted, included, canonicality-pending, confirmed under policy, delayed, rejected, corrected. | Build before customer pilot. |
| AUDIT-001 | Independent verification | Publish versioned export bundle and offline verifier containing structured records, receipts/commitments, signatures/keys or trust references, profile definitions, manifest/inclusion proof, checkpoint chain, Base transaction evidence and a machine-readable report. Customers supply any source material directly to their auditor; it never passes through AIChain. | Required for one-stop governance product; design now. |
| ZK-001 | What “proof” means | Keep RISC Zero policy proof narrow and optional. UI names the exact statement/version and public inputs; unproved assertions remain signed claims. | Agreed for initial spike; do not market as model correctness proof. |
| PRODUCT-001 | Safety monitoring | Record monitor input/source, detector/model version, alert, disposition, actor, intervention and follow-up as linked evidence. Show health and omissions separately; the ledger cannot observe what the customer did not instrument. | Add to first AI profile as event types; safety claims require assurance labels. |
| GOV-001 | Product scope | Governance and monitoring portal across agent/model/policy/decision/outcome history, with receipts as linked evidence units. | Founder direction established; phase the delivery. |
| DATA-006 | Routine collection | Accept bounded UTF-8 JSON text with registered governance fields, codes, references and commitments; reject source content and uploads. | Founder direction established; validate event limits with pilot. |
| DATA-007 | Database | Start with tenant-isolated relational event/registry store, durable outbox, optional encrypted storage for signed governance bundles/manifests/exports, and a separate chain indexer; defer dedicated analytics database until measurement justifies it. | Proposed; hosting/vendor unresolved. |
| GOV-002 | Accuracy reporting | Name the target and label source; show numerator/denominator, cohort, time window, evaluator, sample count and uncertainty. | Product rule; profile metrics still to define. |
| SAFE-001 | Rogue/bypass detection | Compare approved configuration with independently observed effective configuration and tool/action events; disclose monitor coverage and gaps. | MVP direction; integration trust varies. |
| ALERT-001 | Alert semantics | Version rules with threshold, cohort, minimum sample, missing-data behavior, owner, deduplication and incident lifecycle. | Product design requirement. |
| COMM-001 | Product language | Say “tamper-evident record of submitted evidence and its verification trail.” Do not say blockchain makes AI resistant, proves an AI decision correct, or guarantees complete monitoring. | Apply to portal and website now. |

## Assurance model shown in the portal

Every check should be presented with the claim, verifier, inputs, result,
timestamp and limitation. Suggested independent dimensions:

1. **Record integrity:** disclosed bytes match the receipt commitments.
2. **Signature and authority:** signature is valid for the key; key role and
   authorization status at the relevant time are shown.
3. **Execution provenance:** what was observed by customer instrumentation,
   provider attestation, independent witness, or user declaration.
4. **Policy evaluation:** named policy/config/version and result; show a proof
   only when the precise supported statement verifies.
5. **Lineage and completeness:** links, sequence/checkpoint continuity,
   expected event counts and detected gaps. State the scope observed; no system
   can infer that undisclosed events never occurred.
6. **Batch and chain inclusion:** receipt membership in a manifest and match to
   a currently canonical Base event; separately state confirmation/finality
   policy.
7. **Outcome review:** human or downstream action and any correction,
   supersession or appeal. This is an auditable claim, not an AI truth score.

No aggregate “verified” status should hide a missing or failed dimension.
Instead show a summary such as “4 of 6 checks pass; execution is self-attested;
source documents withheld; checkpoint continuity has no detected gap through
sequence 402.”

## Portal navigation proposal

- **Overview:** active agents/models, run and decision volume, quality/policy
  trends, unresolved incidents, queue/anchor health, monitoring coverage and
  retention alerts.
- **Cases / Decisions:** searchable timeline by case, run, agent, model, policy,
  time, outcome and anchor state. Each event opens the same audit detail view.
- **Models & Configurations:** declared provider/model/deployment versions,
  configuration snapshots, policy compatibility and change history.
- **Policies & Evaluations:** policy versions, inputs/outputs of evaluations,
  exceptions, proof status and reviewer disposition.
- **Monitoring:** monitor versions, signals, alerts, triage, interventions,
  recurrence and telemetry coverage. Surface “monitor unavailable” and gaps.
- **Anchors:** batches, checkpoints, Base transactions, RPC observations,
  canonicality and confirmation-policy status.
- **Audit & Access:** role management, disclosure approvals, access log,
  retention/deletion/legal hold and export generation.
- **API & Integrations:** scoped credentials, webhooks, queue/priority policy,
  model gateway/agent SDKs, storage connectors and health.
- **Governance reports:** compare model and configuration versions by
  workload/domain and outcome; display denominators, label sources, cohort
  composition and uncertainty beside every rate.

## Build sequence and gates

1. **First draft implemented locally:** bounded governance event schema,
   metric catalog, validator, and paired-model synthetic dataset. This stores
   structured event text only in the example and has no raw source content.
2. **Implemented locally:** scoped authenticated ingestion/query API,
   SQLite event/outbox transactions, reporting and interactive synthetic portal.
   The service remains separate from the public chain indexer. See
   [delivery status](governance-development-status.md).
3. Define signing/key lifecycle, correction semantics and API authentication;
   then add a tenant-isolated relational database, retention/access controls
   and explicit per-tenant quotas. Reject source content and file uploads at
   the API boundary, not merely in dashboard UI.
4. Connect authenticated portal sessions to the scoped API. The current portal
   already demonstrates metrics, trends, model comparisons, records, incident
   details and exports using generated synthetic reports from the shared service.
5. Build the independent auditor export and test a complete synthetic
   capture-to-checkpoint-to-reconstruction path.
6. Pilot only after tenant isolation, backups/restore, deletion behavior, key
   rotation/revocation, reorg recovery, cost caps, audit export and external
   review pass.

## Decision session order

The first founder choice is evidence custody (DATA-001). Next settle the first
customer workflow/profile and who is trusted to attest execution (AVR-004 /
AVR-007). Then choose hosted versus customer-operated deployment and retention
(DATA-004). Technical details such as batch size and confirmation SLO should be
chosen from measurements after those boundaries are fixed, not guessed now.

## Authenticated workspace increment — 2026-09-26

A connected /workspace now provides provisioned account sign-in, revocable
read-only sessions, membership-scoped API reads, record search/paging and reports.
See [the implementation and operating boundaries](../../../authenticated-customer-workspaces.md).
Production identity lifecycle, hosting, storage and monitoring remain release gates.

## Receipt integration update — 2026-09-27

Authenticated record detail now verifies exact accepted records against recording-service signatures, private batch proofs and fresh Base Sepolia states. Local synthetic batches are prepared but have not been broadcast. Aggregate reports make no blanket signature or chain claim. See [integration design, operator workflow and remaining gates](../../../governance-receipt-base-integration.md).
