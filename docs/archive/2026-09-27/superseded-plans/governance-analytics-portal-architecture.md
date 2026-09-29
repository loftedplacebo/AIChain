# Governance analytics portal and structured telemetry architecture

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](../../../platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

Status: product and data architecture proposal. No production customer
telemetry database or analytics portal is deployed. Updated 2026-09-26.

The next local stages are now implemented: durable scoped ingestion and outbox,
reporting, a six-view synthetic governance portal, and a product/plan preview.
See [current delivery status and next stages](governance-development-status.md)
and the [service runbook](../../../../services/governance/README.md). The public demo uses generated synthetic reports. Authenticated development workspaces now use the private VPS API; production customer onboarding remains pending.

The first local development slice now exists: a strict JSON event schema,
JavaScript validator, versioned metric catalog, and reproducible synthetic
paired-model fixture. See [the governance event schema](../../../../spec/governance/governance-event-v0.1.0-draft.schema.json),
[metric catalog](../../../../spec/governance/metric-catalog-v0.1.0-draft.json), and
[demo dataset](../../../../fixtures/governance/paired-model-comparison-v0.1.0-draft.json).
The schema and fixture now support the synthetic VPS API; this is not a production customer deployment.

## Product definition

The product is an AI governance and operations portal backed by an evidence
service. A receipt is one signed record in a longer history; it is not the
whole product. The portal should help an organisation answer:

- What agents, models, deployments, tools and policies are running, in which
  environment and for which business process?
- What types of decisions and actions are they producing, and what outcomes
  followed?
- How do quality, policy adherence, cost, latency, override rates and safety
  signals change across model or configuration versions?
- Are agents operating outside an approved boundary, bypassing a control,
  calling an unapproved tool, or continuing after a policy/monitor has failed?
- Can an operator trace an aggregate chart or alert back to the underlying
  records and selectively inspect the evidence they are authorized to see?

The system accepts useful structured telemetry without requiring customers to
send full conversations. It should support aggregate reporting by workload,
case type, policy, model, production line, vehicle or other domain-specific
dimensions. Every aggregate needs a traceable definition, source population,
time window and denominator.

## Data collection policy: structured by default, source content stays with customer

Use three data classes and make the class visible in the API and UI:

| Class | Example | Default handling |
|---|---|---|
| Governance metadata | Tenant/project/environment, agent ID, declared and observed model deployment, policy/config version, timestamps, event type, outcome code, latency, token/cost bucket, tool IDs, alert disposition | Collect as bounded, typed fields; searchable and reportable under tenant access controls. |
| Evidence summaries | Prompt-template ID, input/output category, retrieval count/source IDs, tool result code, evaluator score and rationale code, human disposition | Collect registered identifiers, enumerations, bounded numbers, references and commitments only. No free-form narrative or redacted transcript snippets in the event API. |
| Source evidence | Full prompt/context, conversation transcript, documents, images/video, raw sensor streams, proprietary policies | Never upload to or store in AIChain systems. Keep customer-side. The API may receive a customer-controlled reference and commitment only; any retrieval must occur from the customer's system under its authorization. |

The customer submits a UTF-8 JSON text request through the API. “Text” here
means a structured, versioned JSON event, not free-form logs and not a source
transcript. AIChain stores the accepted governance fields and receipt metadata,
never the request/response content of the underlying AI conversation. The API
must reject file uploads, multipart payloads, raw source-content fields and
unregistered free-text extensions.

The standard run record should be useful even when source evidence is absent.
It can say what model/configuration was declared, which policy was checked,
what outcome category was recorded, which tools were invoked, and whether
evidence was withheld. It must not imply that a missing artifact was inspected.

### Proposed initial limits and submission controls

These are product defaults to validate in the first pilot, not yet protocol
limits or tested capacity claims:

- Limit the canonical structured event to **64 KiB** after normalization.
- Allow up to **20 typed evidence references/commitments** on an event. These
  refer to customer-held material and contain no source bytes or credentials.
- Accept `application/json` UTF-8 event bodies only. Do not provide a file,
  multipart, transcript or binary evidence upload endpoint.
- A customer storage connector, if later added, must be read-through and
  customer-authorized; AIChain must not persist or cache retrieved bytes. The
  first release should export references and commitments only.
- Enforce per-tenant and per-project rate, monthly volume and storage quotas;
  return a durable event ID, idempotency result and clear `accepted`, `partial`
  or `rejected` status. Never silently truncate fields.
- Make optional fields and profile extensions namespaced and versioned. Reject
  unknown fields in a pinned schema version rather than discarding them.
- The current draft accepts structured JSON values encoded as UTF-8 text. It
  does not accept source-content fields or arbitrary profile extensions;
  supported fields must be registered in a later schema/profile version.

The first pilot should test whether 64 KiB covers realistic structured
instrumentation and whether the reference/commitment limit fits target
workflows.
Limits should be configurable per contract, not a single hard-coded global
number. High-volume agent runs should submit small event records and roll up
routine telemetry; detailed evidence is retained or disclosed selectively.

## Extensible event model

Use a stable common envelope and versioned domain profiles. Keep the envelope
small and put use-case-specific fields in a typed profile payload, not opaque
unvalidated blobs.

### Common entities

- **Tenant / project / environment:** ownership and isolation boundary.
- **Agent or machine:** stable opaque identity, owner, lifecycle and authorized
  operating scope.
- **Model deployment:** provider/model family, declared version, deployment
  digest or endpoint identity when available, release window and registry
  source. Preserve historical versions; never update old runs in place.
- **Configuration and policy:** immutable version IDs/digests, approval state,
  effective dates, allowed tools/actions, thresholds and change record.
- **Run / episode / case:** groups the initiating event, one or more model
  invocations, tools, policy evaluations, human reviews and final outcome.
- **Event:** immutable typed observation with event ID, parent/correlation IDs,
  sequence, event and ingestion times, actor, source, profile/schema version,
  declared/effective config references, fields, evidence references and
  signature/commitment state.
- **Outcome / evaluation:** label, evaluator and version, label source,
  adjudication state, event time, outcome window and confidence/uncertainty.
- **Alert / incident:** rule/model version, observed signal, threshold,
  severity, deduplication key, response owner, disposition, action and closure.
- **Checkpoint / anchor:** receipt or event range, Merkle manifest, signed
  checkpoint, chain/contract/batch/transaction/block references and
  canonicality observations.

### Event lifecycle and trust provenance

Store both `occurred_at` (claimed/source time) and `received_at` (server
observation time), plus clock source/uncertainty where available. Preserve the
original event body, its schema/profile digest, signer/key ID, signature
verification result, producer integration version and source class. Later
corrections, retractions, outcomes and adjudications are new linked events;
do not rewrite history. Different sources should be distinguishable:

1. customer gateway or agent self-report;
2. independent policy/runtime monitor;
3. downstream business-system confirmation;
4. provider or hardware/runtime attestation;
5. human-reviewed or independently adjudicated outcome.

The portal must not present these sources as equally strong. A self-report can
be integrity-protected and still be incomplete or false.

### Example bounded run event

This draft shows the kind of structured submission that can support
governance reporting without sending a conversation transcript. IDs and values
are illustrative; exact field names belong in a versioned profile.

```json
{
  "schema": "aichain.governance-event",
  "schemaVersion": "0.1.0-draft",
  "profile": "urn:aichain:profile:enterprise-agent",
  "tenantRef": "org_opaque_42",
  "projectRef": "claims-assistant",
  "environment": "production-eu",
  "eventId": "evt_01J8EXAMPLE",
  "runRef": "run_01J8EXAMPLE",
  "caseRef": "case_01J8EXAMPLE",
  "sequence": "18",
  "occurredAt": "2026-09-26T09:14:04.900Z",
  "receivedAt": "2026-09-26T09:14:04.947Z",
  "eventType": "ai.model.response-recorded",
  "source": {
    "kind": "customer-gateway",
    "integrationVersion": "gateway-2.3.0",
    "keyRef": "key_gateway_7",
    "signatureRef": "sig_opaque_991"
  },
  "agentRef": "claims-agent-3",
  "model": {
    "providerRef": "provider-a",
    "modelRef": "claims-assistant",
    "deploymentRef": "deployment-17",
    "declaredConfigDigest": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "observedConfigDigest": "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "observationSource": "gateway-attested-request"
  },
  "policy": {
    "policyRef": "claims-routing",
    "version": "8",
    "decision": "review-required",
    "ruleRefs": ["document-conflict-requires-review"]
  },
  "activity": {
    "promptTemplateRef": "claim-review-12",
    "inputClass": "equipment-claim",
    "retrievalCount": 3,
    "toolCalls": [{"toolRef": "invoice-checker", "version": "4.2.1", "resultCode": "date-conflict"}],
    "outputClass": "manual-review-recommendation",
    "latencyMs": 1669,
    "tokenBand": "1k-2k"
  },
  "evidence": [
    {"role": "input", "commitmentRef": "commit_input_1", "availability": "customer-held"},
    {"role": "output", "commitmentRef": "commit_output_1", "availability": "customer-held"}
  ],
  "outcome": {"status": "pending-human-review"},
  "parentEventRefs": ["evt_01J8EXAMPLE_PREVIOUS"]
}
```

The customer can later submit separate `human-review-recorded`,
`business-action-confirmed`, `quality-label-added` or `correction-issued`
events. That makes outcome maturation and later reassessment visible without
rewriting the original run. The `observedConfigDigest` is only as strong as its
source: a gateway's signed observation differs from an independent runtime
attestation and the portal must label that difference.

### Domain profiles and dimensions

The shared event envelope supports profiles for enterprise agents, legal
research/workflows, content provenance, supply chain, industrial robotics,
vehicles and drones. A profile defines permissible dimensions and meaning. For
example:

| Domain | Useful reporting dimensions | Outcome/quality evidence needed |
|---|---|---|
| Legal | Matter type, jurisdiction, case-law category, task, model/deployment, research workflow, reviewer | Citation/authority validation, lawyer-reviewed correctness label, correction/reversal, sample and adjudication rules. Do not expose client-identifying facts in shared analytics. |
| Robotics / production | Site, production line, machine/robot ID, firmware, model/config, task and shift | Ground-truth sensor/inspection result, safety stop, defect/rework, operator intervention and calibrated measurement source. |
| Autonomous vehicle | Fleet, vehicle ID, software/model release, route/operating-design-domain, weather/road category, event type | Safety-driver intervention, disengagement, near-miss/incident classification and independent investigation status; location and passenger details need heightened minimization. |
| Customer-service agent | Agent/deployment, intent category, policy route, tool/action, escalation/override, service outcome | Customer correction/complaint, sampled QA or human-reviewed label. Full dialogue is not needed for routine reporting. |
| Content/supply chain | Asset/product/component, producer, source model/tool version, provenance workflow | External signature/provenance appraisal, downstream acceptance/rejection, recall or rights review. |

Profiles must distinguish a **decision**, a **model response**, a **policy
result**, a **business outcome**, and a **quality label**. They are not
interchangeable. A customer can define a custom profile, but dashboards should
only aggregate fields with compatible units and semantics.

## Metrics and alerts

### Metrics should be reproducible

Every metric definition has an immutable ID/version, formula, input event
types, inclusion/exclusion rules, grouping dimensions, minimum sample rule,
label source, time window and known limitations. Store the numerator and
denominator with the displayed rate. Show sample counts and confidence or
uncertainty where relevant; suppress or flag small groups to avoid false
precision and accidental disclosure.

Examples include:

- policy pass, block, exception and override rates;
- unauthorized/unknown tool attempts and declared-versus-observed config
  mismatches;
- human escalation, correction, appeal and reversal rates;
- model latency, availability, cost and token bands;
- evaluator agreement and quality scores by task and version;
- robotics defect, safety stop and operator intervention rates by line/robot;
- legal citation validation and lawyer-reviewed error rates by case type;
- monitor coverage, source heartbeat, queue delay, missing sequences and
  checkpoint/anchor lag.

“Accuracy” must name the target and label source. Examples: “citation support
rate among 480 lawyer-reviewed outputs, reviewer rubric v3, 30-day window” or
“defect classification precision against calibrated line inspection results.”
An LLM judge score alone is not ground truth. Model comparisons should show
matched populations, cohort sizes, case mix, policy/config changes, evaluator
version and uncertainty; avoid claiming a model caused a difference unless the
comparison design supports that conclusion.

### Alert types

- **Hard policy event:** blocked action, unauthorized tool, setting tamper or
  permission boundary violation.
- **Observed/declaration mismatch:** effective runtime config differs from
  approved registry version, policy disabled, unapproved model/tool endpoint.
- **Behavioral drift:** outcome/error/override rate exceeds an agreed band for
  a defined cohort with adequate labels and sample size.
- **Safety event:** intervention, emergency stop, near miss, prohibited action
  or escalation, with domain severity and investigator state.
- **Control health:** monitor offline, telemetry missing, event-sequence gap,
  signing key revoked, ingestion backlog or checkpoint/anchor delay.
- **Resource anomaly:** unusual tool-call, data-access, cost or action pattern.

Each rule records owner, severity, cohort, threshold, baseline, evaluation
window, minimum sample, missing-data behavior, deduplication/cooldown, response
SLA and escalation path. Alerts have lifecycle states (`open`, `acknowledged`,
`investigating`, `mitigated`, `closed`, `false-positive`) with signed human or
automation actions. A threshold crossing is evidence to investigate; it is
not by itself proof that an agent is malicious or “rogue.”

### Detecting agents that bypass settings

The strongest practical MVP is a **declared-versus-observed control loop**:

1. Customer registry pins approved model, runtime, tools, policy and limits.
2. Gateway/agent SDK emits the effective values and each tool/action request.
3. An independent enforcement point (gateway, policy engine, OS/container or
   hardware monitor) records allow/deny and observed runtime identity.
4. Portal compares events with the approved snapshot and emits an alert on
   mismatch, disabled monitor, missing heartbeat or forbidden action.
5. A signed incident timeline links detection, containment and operator review;
   the checkpoint anchors that submitted history.

If the same compromised agent controls both execution and reporting, it can
lie or omit events. Stronger coverage needs an independent gateway, external
monitor, provider attestation, protected logs or hardware-backed measurement.
Portal copy should state the source and coverage boundary for each signal.

## Database and storage architecture

This is an **extensible multi-tenant governance data system**, with Base as an
independent timestamp/commitment layer. The chain is not the database, event
bus, evidence archive, time-series store or analytics engine.

### Recommended first production shape

- **Operational system of record:** managed PostgreSQL (or equivalent
  relational database) for tenant/project registry, agents, model/config/policy
  versions, event metadata, event relationships, labels, metric definitions,
  alert state, access audit and anchor references. Use tenant IDs in every
  row, database-enforced isolation, versioned migrations, partitioning by
  tenant/time for high-volume event tables, indexes for common dimensions, and
  append-only event semantics with corrections represented as new rows.
- **Structured artefact store:** encrypted tenant-scoped object storage only
  for signed governance bundles, manifests, checkpoints and generated exports
  if these outgrow relational storage. It must not contain source prompts,
  conversations, documents, raw telemetry or attachments. Customer-managed
  object stores may be referenced, but source bytes remain in customer custody.
- **Ingestion/outbox:** authenticated API and SDK write to a durable queue/outbox
  before asynchronous normalization, validation, indexing and batching. Idempotency
  and event status are part of the public API. Do not make customer acceptance
  depend on immediate Base RPC availability.
- **Analytics:** begin with indexed PostgreSQL queries and scheduled rollups
  over carefully bounded windows. Add a columnar/OLAP warehouse or time-series
  database only after measured event volume/query needs justify the extra
  system and its consistency/retention costs. Preserve metric definitions and
  allow drill-down from aggregates to authorized source events.
- **Blockchain indexer:** keep chain-derived anchor/event data in a separate
  read model with reorg-aware replay. Join to private events only through
  verified batch/checkpoint references. A provider outage must not erase the
  customer's event history.

Do not choose a vendor-specific managed DB before deciding data residency,
customer-managed keys, deployment mode and the actual website/VPS hosting
boundary. The existing website hosting config has no production D1/R2 binding;
that is not an adequate basis to store customer telemetry. PostgreSQL is a
logical recommendation, not an already-selected service.

### Logical data flow

```text
Agent SDK / gateway / machine connector / human review / outcome evaluator
            |
            v
Authenticated ingestion -> schema + quota + signature checks -> durable outbox
            |                                                   |
            v                                                   v
Customer-held evidence (never uploaded)                  append-only event store
            |                                                   |
            +-- references/commitments --> authenticated JSON API
                                           validation + durable outbox
                                                        |
                                  commitments/checkpoints <---+
                                                           |          |
                                                           v          v
                                                     Base anchor   metric rollups
                                                           |          |
                                              reorg-aware index       v
                                                           +----> governance portal
                                                                  alerts + exports
```

Source material remains in the customer's systems. If a connector is later
offered, it may request a customer-authorized read for the active session and
stream bytes directly to the user's browser or a customer-controlled auditor
tool; AIChain must not persist, cache or back them up. The first release uses
references and commitments without source retrieval.

## Security, privacy and governance requirements

- Strict tenant isolation across API, database queries, object storage,
  analytics, exports and caches; test cross-tenant denial continuously.
- Separate identities/keys for event signing, storage encryption, user login
  and Base transaction submission. No shared hot key should authorize all four.
- Encrypt transport and stored governance data; support key rotation and scoped service
  accounts. Record data-region and subprocessor choices before customer data.
- Minimize direct identifiers and sensitive free text. Prefer customer-side
  opaque IDs, categorization codes and keyed/tokenized dimensions. A plain hash
  of predictable personal data may be guessable; commitments are not
  anonymization.
- Treat every customer-supplied reference as potentially sensitive. Require
  opaque, tenant-scoped IDs; tell customers never to put names, account numbers,
  prompt fragments, credentials or source excerpts into IDs or category fields.
- Apply field-level roles, redaction, purpose-bound disclosure, expiry,
  customer-approved auditor access and complete access logging.
- Define class-specific retention, legal hold, export, deletion, backup expiry
  and post-deletion verification behavior. Public chain commitments are
  permanent and may themselves be linkable; anchor only minimized metadata.
- Provide monitoring completeness indicators: active integrations, expected
  sources, heartbeat age, sampling rate, failed submissions, sequence gaps,
  unmatched actions and last successful checkpoint.
- Make analytics lineage auditable: which source rows and metric-definition
  version produced each reported number or alert.

## Delivery sequence

1. **Telemetry contract:** common event envelope, enterprise-agent profile,
   model/config registry, policy/decision/tool/human/outcome events, schema
   limits and assurance-source fields. Generate sample payloads and reject
   oversize/unknown/malformed input.
2. **Local end-to-end reference:** capture synthetic events, append correction,
   calculate reproducible metrics, alert on a config deviation, form signed
   checkpoint, anchor it on Base Sepolia and reconstruct/export offline.
3. **Database and API proof:** implement tenant-isolated event store, durable
   outbox, object-store adapter, retention/access log and query API. Benchmark
   realistic structured event rates and cardinality before fixing scale SLOs.
4. **Governance portal MVP:** agent/model inventory; decisions timeline; policy
   and configuration comparison; quality/outcome reports with denominators;
   alerts/incidents; evidence/anchor drilldown; audit export.
5. **First integrations:** customer-service/enterprise agent SDK and one
   independent policy/runtime monitor. Add a labelled outcome/evaluation
   workflow so quality reports have meaningful targets.
6. **Domain packs:** legal, robotics/production and vehicles each get profile,
   dimensions, metric definitions, ground-truth source, alert rules and
   privacy review. Do not reuse an unqualified “accuracy” metric across them.
7. **Scale and deployment options:** add dedicated analytics infrastructure,
   customer-controlled reference connectors, customer-managed keys and
   regional/self-hosted operation only when pilot volume, threat model and
   customer demand justify them. Source content remains outside AIChain custody.

## Decisions this proposal adds

| ID | Decision | Recommendation | Status |
|---|---|---|---|
| GOV-001 | Product scope | Governance and monitoring portal across agents/models/policies/decisions/outcomes; receipts are linked evidence units. | Proposed; founder direction supports this. |
| DATA-006 | Routine collection | Accept bounded JSON text containing registered governance fields, codes, references and commitments; never accept or store customer source content. | Founder direction; validate event limits in a pilot. |
| DATA-007 | Canonical database | Relational operational store first, optional encrypted store for signed governance bundles/manifests/exports only, durable outbox, separate chain indexer; defer separate OLAP/time-series system until measured need. | Proposed; hosting/vendor unresolved. |
| GOV-002 | Accuracy reporting | Only calculate named metrics against identified labels/ground truth with denominator, cohort and uncertainty; label unadjudicated outcomes and LLM judges. | Required product rule. |
| SAFE-001 | Rogue/bypass monitoring | Compare approved vs effective configuration using an independent enforcement/monitoring source where possible; show gaps and source assurance. | MVP direction; coverage depends on integrations. |
| ALERT-001 | Threshold alerting | Version rules with cohort, sample threshold, baseline, missing-data semantics, dedupe, owner and incident lifecycle. | Product design requirement. |
| GOV-003 | Extensibility | Common envelope + versioned profile payloads and metric definitions; no arbitrary blobs in analytics schema. | Proposed protocol/API rule. |

## Limits of the product claim

The portal can provide a longitudinal, evidence-backed view of what connected
systems reported and what independent controls observed. It cannot guarantee
that every AI action was captured, prove a declared model ran without a trusted
execution signal, make incomplete labels into accuracy, or prove that an
anchored agent was safe. Its strongest differentiator should be the linked
governance record, anomaly visibility and reproducible audit—not a claim that a
blockchain prevents an agent from going rogue.

## Authenticated workspace increment — 2026-09-26

A connected /workspace now provides provisioned account sign-in, revocable
read-only sessions, membership-scoped API reads, record search/paging and reports.
See [the implementation and operating boundaries](../../../authenticated-customer-workspaces.md).
Production identity lifecycle, hosting, storage and monitoring remain release gates.
