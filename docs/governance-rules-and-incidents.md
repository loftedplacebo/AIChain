# Rules and detected incidents — local alpha

28 September 2026. `services/governance/governance-rules.cjs` connects immutable
versioned rule definitions to accepted governance records, durable incidents,
webhook jobs and detected-record publication. Tenant-scoped API routes and portal
rule/incident controls are now implemented behind an explicit local SQLite opt-in.
No production scheduler, PostgreSQL rule deployment or automatic VPS notification
service is enabled. Existing users have not been granted new permissions.

## API, portal and permissions

Set `GOVERNANCE_RULES_DB` to a protected journal path to enable these routes in
dev/test SQLite startup. Absence of this setting returns 503 for rule/incident
operations; the portal explains that they are unavailable on the deployment.
`GOVERNANCE_NOTIFICATION_DESTINATIONS` is optional trusted operator JSON, mapping
opaque destination references to tenant, project, keyRef and URL. It does not
start network delivery or schedule scans. Keep URLs stable per reference and
handle keys through the separate delivery resolver. No secrets belong in browser
configuration. The API lists only scoped destination references, never URLs/keys.

| Route | Behaviour | Permission |
| --- | --- | --- |
| GET /v1/rules | Active definitions and scoped destination references; signing keyRef omitted | Workspace/project read |
| POST /v1/rules | Create immutable version and activate prospectively | Authenticated governance-admin session |
| POST /v1/rules/preview | Definition plus up to 100 unique accepted eventIds; no arbitrary raw record payload | Authenticated governance-admin session |
| GET /v1/incidents | Detected operational state across all dates; paginated limit 1–100, total and nextOffset | Workspace/project read |
| GET /v1/incidents/:id | Scoped state and bounded action history | Workspace/project read |
| POST /v1/incidents/:id | Revision-checked acknowledge/resolve/reopen action | Authenticated governance-admin session |

The new role is `governance-admin`, explicitly provisioned in user workspace
configuration. It grants read and manage-governance, not ingestion-write or human
review permission. Existing reader/reviewer roles are unchanged. Bearer ingestion
credentials cannot administer governance even if their scope array contains
manage-governance. Actor references are derived from the authenticated session
using an opaque hash; caller actorRef and tenant/project overrides are rejected.
Role changes invalidate existing sessions through the established configuration
version mechanism. Governance mutations require uncompressed JSON up to 4 KiB.

The website gateway applies the existing same-origin, HttpOnly cookie and private
response boundary. Portal Rules shows definitions, preview assessments and a
structured version editor for administrators. Incidents shows paginated detected
state, triggering-record evidence and append-only action history, alongside the
existing immutable alert-record view. It keeps operational state separate from
receipt/chain state. Permission declarations and missing observations are not
presented as independently enforced controls or complete safety coverage.

Externally submitted records cannot use the reserved rule-engine integration
version or keyRef through /v1/events. Internal detected-event publication enters
the store through the trusted service boundary. This identifies the service
producer; it does not attest that customer source observations were truthful.

## Rule contract

Rules contain an opaque id, increasing integer version, environment, optional
agentRef/taskClass filters, condition, severity and optional destinationRef/keyRef
pair. Unknown fields and arbitrary expressions/source content are rejected.
Supported per-record conditions are:

| Condition | Match | Missing data |
| --- | --- | --- |
| run-failed | Submitted execution status is failed | Pending execution status |
| latency-exceeded | Submitted latencyMs exceeds the integer thresholdMs | Latency absent |
| tool-permission-denied | At least one submitted tool observation declares allowed=false | No observations, or missing permission declarations without a known violation |
| tool-failed | At least one submitted tool outcome is failed | No observations, or nonterminal/unknown outcomes without a known failure |

Equality to a latency threshold is clear, not a breach. Environment/agent/task
filters and non-run event types produce not-applicable. A known breach wins over
other missing observations; clear means only that submitted values did not match
this condition, not that all activity was observed or the agent is safe. Framework
callbacks never infer allowed=true, so permission rules need explicit customer
instrumentation. Rate windows, model drift/accuracy tolerances, minimum samples,
cooldowns, policy enforcement and complete coverage remain later work.

`preview(principal, definition, records)` validates up to 1,000 scoped records and
returns match/clear/missing/not-applicable per event without changing state.
`register` records definition, actor reference and activation time; changed content
under an existing version is rejected, and versions/activation times cannot go
backwards. There are at most 100 rule identities per project. Current APIs do not
provide rule disabling or deletion. Preview before activation and retain versions.

## Versioning, provenance and processing

Rules apply prospectively by **API receivedAt**, not customer occurredAt. Delayed
processing uses the highest version activated before that receive time, preserving
historical policy rather than applying today's version to yesterday's backlog.
Once processed, event content/digest and evaluation results are retained; replay
does not reinterpret the event under newer rules. Changed evaluated content under
the same identity fails explicitly. Historical evaluation with proposed rules
belongs in preview, not silent rewriting of detected history.

`processStored(store, principal, eventId)` reads an existing scoped record;
`scanStored` reads up to 1,000 append-only SQLite governance rows per call in rowid
order and persists a tenant/project cursor. A crash after evaluation but before
cursor update causes safe deduplicated replay. Processing failures leave the
failed row for retry. This scanner requires SQLite and the existing append-only
event storage: retention/deletion, database replacement or restore need coordinated
cursor handling. Restore governance storage and the journal consistently; do not
reuse a cursor with an unrelated/rebuilt database. PostgreSQL scanning remains open.

The caller must authenticate principals, authorize rule changes and incident
actions, derive actor references from authenticated sessions, and schedule scans.
These libraries do not establish identities or roles. The lower-level `process`
method accepts validated records from trusted code; public callers must use the
accepted-record boundary rather than treating supplied JSON as an observed fact.

## Opt-in local processing loop

`services/governance/rule-processing.cjs` provides bounded sequential processing
for explicitly configured tenant/project scopes. Dev/test startup enables it only
with `GOVERNANCE_RULE_PROCESSING_ENABLED=true`, a `GOVERNANCE_RULES_DB` path and
`GOVERNANCE_RULE_PROJECTS=[{"tenant":"example","project":"pilot"}]`.
The project list is trusted operator configuration, not a request parameter;
1–100 unique scopes are allowed. `GOVERNANCE_RULE_INTERVAL_MS` is 1,000–60,000
(default 5,000). The default cycle scans at most 100 records and publishes at
most 100 derived alerts per project. Existing durable cursors/outboxes resume
after restart; overlapping cycles coalesce. A failed project retries next cycle
without suppressing processing of other configured projects. Persistent record
failures are visible and block that project's cursor rather than skipping it.

`processor.status` exposes the latest cycle's per-project processing/publication/
delivery counts and failure flags to trusted operator code, without raw errors,
records or secrets. Status is currently in-memory; it is not a public metrics
endpoint or durable health history. `stop()` clears scheduling and waits for
active work before journals/storage close. The API service exposes this processor
and its orderly stop function to local hosts, but still gates production startup.

Startup never configures webhook delivery. Trusted embedded callers may explicitly
inject scoped destinations, a key resolver and optional transport into
`RuleProcessor`; each project gets at most 10 delivery claims per cycle by default
(configurable 1–100). Publication failure prevents delivery during that project's
cycle. This sequencing ensures the derived alert is accepted into the receipt
pipeline first; delivery does not wait for blockchain anchoring. No external
destination was contacted or VPS deployment changed by this increment.
Five processor tests cover real scoped incidents and signed alert evidence,
default-disabled delivery, failures/recovery, exact signed notification payloads
with a simulated transport, overlapping cycles, repeated timer execution and
orderly shutdown. Production scheduling/monitoring, PostgreSQL and destination
provisioning remain release gates.

## Atomic production and receipt path

For a match, one transaction in the delivery journal records:

1. Evaluation provenance and a stable incident ID derived from scope/event/rule/version.
2. An open incident with rule version, severity and detected time.
3. A pending `ai.monitor.alerted` governance record linked to the original event.
4. An optional stable webhook job bound to destination/key references.

A failed job insertion rolls all four back. The derived governance record is a
**downstream-system** observation with `orvessian-rules-0.1.0-alpha` integration
version, preserving the distinction from customer-submitted incident records.
It does not assert independent observation of model execution. Its policyRef and
version identify the preserved rule; it never claims to stop or enforce an agent.

`publishDetected` ingests pending derived records through the scoped governance
store and removes them from the pending set only after a matching accepted/duplicate
acknowledgement. The fixed body survives uncertain publication and replays. This
outbox bridges separate databases; publication is at least once, not a distributed
transaction. Accepted derived records enter the existing signing/batching pipeline
and can be anchored by its normal worker. Local tests verify their signed receipt
and batch membership; no Base transaction is broadcast by this increment.

Rule definitions and incident transition history are preserved in the journal but
are **not themselves signed or anchored yet**. A receipt for a derived alert binds
its rule reference/version and submitted observation; it does not prove the full
rule artefact or lifecycle history. Auditable rule export/commitments are a release
task. Existing portal incident counts reflect immutable alert records, not this
journal's latest operational incident states: connect the new incident API before
claiming those counts are a live resolved/open incident dashboard.

## Incident lifecycle

Acknowledgement changes open → acknowledged; resolution changes open/acknowledged
→ resolved; reopening changes resolved → open. Each action requires a stable
actionId, authenticated actorRef, bounded reasonCode and expectedRevision. Stale
revisions fail; an exact action retry returns the original revision. Changed
content under the same actionId fails. History is appended rather than rewriting
past actions. Listing/history are tenant/project scoped and bounded to 100 rows.
Owner assignment, free-form notes, full-history pagination, notification of lifecycle changes
and receipt-backed lifecycle events are not yet implemented.

## Validation and release gates

```text
node --test services/governance/governance-rules.test.cjs services/governance/webhook-delivery.test.cjs services/governance/webhook-signatures.test.cjs
```

Nine engine/webhook tests pass: four condition semantics, preview privacy/scope, immutable
versions, historical backlog, replay/conflict, transactional rollback, matching
publication acknowledgement, signed derived evidence, incident revisions/history,
scanner restart, webhook recovery and egress restrictions. Current tests establish
local functionality, not capacity, production HTTPS compatibility or real-world
detector quality. Eighteen combined engine/API/session/review/webhook tests pass,
including real local gateway requests, role enforcement, actor spoofing, reserved
source identity, same-origin protection and incident pagination. Website build
and scoped workspace typechecking pass; interactive browser validation of the
new forms remains open. Before rollout: PostgreSQL support, production
processing deployment/monitoring, quotas/retention/backups,
versioned rule artefacts, coverage metrics, destination provisioning and security
review. The [webhook delivery gates](governance-webhook-delivery.md) also apply.
