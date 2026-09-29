# SDK and integration plan

## Current seven-wave delivery status — 28 September 2026

This table supersedes older checkpoint descriptions below. These are locally
tested alpha increments; no registry publication, VPS rollout or production
release occurred. Source content remains customer-held.

## Integration development-pass audit — 28 September 2026

The requested development pass covers concrete implementation and validation
across all seven integration lanes. It does not authorize registry publication,
production rollout or arbitrary external notifications. Each requested capability
has current implementation and exercised evidence:

| Requested capability | Authoritative implementation and validation |
| --- | --- |
| Harden/package Python LangChain/LangGraph ingestion | `sdk/python/pyproject.toml`, client and shared queue; pinned real callback tests; source and installed-wheel quickstarts outside checkout reach scoped API and independently verified signed evidence |
| Build TypeScript ingestion | Packaged dependency-free Node client/declarations, run/outcome/configuration builders and durable queue; privacy/scope/ack/retry/restart tests; actual API/registry/evidence round trips; all nine installed runtime/declaration files byte-match tested source |
| Allowlisted OpenTelemetry mappings | Pure OTLP mapper and actual Python SpanExporter; real Simple/BatchSpanProcessor tests, root filtering and strict status handling; private span fields excluded; real exporter to API and signed receipt proof |
| Extend agent activity | Actual LangChain tool callbacks plus explicit Node tool/action/parent metadata and MCP root observations; bounded capture/failure counters; portal tool details render outcomes and declared permissions; tampered tool metadata fails receipt verification |
| Evaluation import | Normalized labels and Langfuse v3 categorical reader/mapping with explicit event/case links; automated labels excluded from adjudicated accuracy; atomic durable page checkpoints, immutable revisions, rollback/restart/stale-writer tests; local vendor HTTP to API/signed evidence |
| Signed outbound webhook foundations | Exact-body HMAC, scoped durable journal, fenced retries, pinned public-IP HTTPS policy; real local receiver/restart/deduplication tests; rules/incident/outbox/API/portal foundations and opt-in bounded processor; no external destination enabled |
| Further justified ecosystem integration | MCP 2.2.0 call wrapper, actual direct/legacy SDK and real stdio subprocess with credential exclusion/clean shutdown; both transports reach one root record and signed evidence; cloud/provider/enterprise breadth deferred to a chosen partner |
| Source content and tenant isolation | Structured-only schemas/bounds, SDK and adapter privacy tests, queues bound to origin/tenant/project; authenticated API/gateway scope and server-side isolation tests; registry/counters do not falsely claim fleet completeness |
| Documentation and compatibility | This consolidated current matrix plus package/framework/telemetry/MCP/Langfuse guides and pinned requirements; boundaries, unverified support and release decisions remain explicit |

Fresh combined checks: **56 governance/API/worker/integration tests**, **21 Node
SDK/schema tests** (14 integration-SDK tests plus seven schema/report tests),
**27 Python tests**, **four isolated MCP tests**, and **22 website tests** pass.
The website production build and strict Node SDK declaration compilation pass.
The framework environment deliberately skips the optional MCP module; its four
tests run separately with MCP installed. PostgreSQL cases in this audit use
PGlite, not a new native-server load or deployment test. Provider/chain behaviour
in these tests uses local fixtures/mocks; no new paid inference or Base broadcast
occurred. Installed Python acceptance tests the built wheel with already-pinned
framework dependencies, not a fresh online extras resolver.

Full website typechecking was also rechecked and remains blocked by the existing
explorer `Anchor.logIndex` declaration and Cloudflare worker ambient types. A
successful build does not close this gate or replace interactive browser checks.
Customer/remote vendor validation, production operating controls and broader
compatibility are separate follow-on work listed below; no complete vendor
support, independent runtime enforcement or production readiness is claimed.

Local artifacts audited: Python wheel SHA-256
`dd88af8430a7b9df34e42302ac165cd4cd32ec87a91263351369ae18f5de6b0e`;
Node tarball SHA-256
`333b657710fcec19e13e4efea0ebe1ac77139b99bafea90d52c93ba33aeb2f20`.
They remain ignored development artifacts under `build/sdk-packages`.

## Current delivery matrix

| Wave | Implemented and tested | Remaining before claiming full support |
| --- | --- | --- |
| 1. Python/framework packaging | Locally installable wheel, optional pinned framework extras; root LangChain/LangGraph adapter and durable queue; matching event acknowledgement required, malformed JSON errors sanitized; installed-wheel quickstart copied outside checkout with module provenance checks and real LangGraph/API/signed-evidence round trip | Wider Python/framework version matrix, clean dependency resolver validation, ownership/licence/support decisions and publication |
| 2. TypeScript/JavaScript | Dependency-free Node client with declarations, strict run/outcome/configuration-observation builders, registry/heartbeat, bounded transport and retries; immutable client scope; optional persistent SQLite queue with scope/collision/capacity/restart checks; real API to signed-evidence integration for all three record types | Broader runtime matrix, customer ergonomics and independent verifier packaging; browser transport is not supported |
| 3. OpenTelemetry | Node OTLP JSON mapper plus actual Python SDK 1.45.0 SpanExporter; configured root-span filtering, durable metadata queue, unset-status/failure counters, real Simple/BatchSpanProcessor tests and API-to-signed-evidence round trip | Collector integration, GenAI/OpenInference conventions, parent/distributed correlation, SDK sampling/drop telemetry, broader version matrix and production overhead |
| 4. Agent activity | Python real LangChain/LangGraph tool callbacks map configured tool identity/version and completed/failed/pending outcomes into root records; Node accepts explicit tool observations, action codes and parent references; review investigation and evidence views display tool outcomes and customer-declared permissions; privacy/limits and signed-evidence tamper checks pass | Handoff/approval semantics, separate tool event identity/timing and aggregate tool metrics; observations do not attest enforcement; capture gaps require customer monitoring |
| 5. Evaluations | Normalized JSON import plus customer-side Langfuse Scores API v3 categorical reader/converter; explicit project/subject-to-event/case links, label mapping, privacy checks, mutable-score conflicts; atomic page/queue checkpoints with fixed-window/configuration binding and restart/stale-writer/rollback validation; local HTTP-to-queue/API/signed-evidence validation; vendor annotations remain excluded from human-reviewed accuracy | Live design-partner validation, numeric/boolean semantics, authenticated provenance/calibration, scheduled polling/late-arrival policy and source revisions; other named vendors remain planned |
| 6. Actions | HMAC envelope, scoped SQLite journal/runner and pinned public-IPv4 HTTPS transport; versioned per-record rules, preview, durable incidents/lifecycle and atomic job production; detected-record outbox enters signed-evidence pipeline; opt-in tenant API and portal; opt-in bounded local scan/publication scheduler with explicit projects, failure isolation, coalesced cycles and orderly shutdown; embedded delivery requires explicit trusted configuration | Interactive portal validation, windowed rules, destination provisioning, production processing deployment/observability, PostgreSQL, retention/recovery UI, rule/lifecycle evidence, managed-key rotation and durable recipient deduplication; public HTTPS delivery remains unvalidated |
| 7. Ecosystem breadth | Existing narrow OpenAI/LangChain path plus actual MCP 2.2.0 call wrapper within an agent root; explicit server/tool references, content-free status, direct/legacy in-memory and actual local stdio subprocess tests; process identity, credential exclusion and clean shutdown checks; both transport paths reach signed evidence without extra model-run counts | Customer/remote HTTP MCP validation, approval/handoff semantics, broader SDK/runtime matrix and partner-selected cloud/provider/enterprise connectors |

Validation: 27 Python tests, 14 Node SDK tests and the real LangGraph and OpenTelemetry/API/receipt integrations passed, including local API/signing,
restart/failure retention and evaluation-report exclusion. TypeScript declarations
compile with strict NodeNext settings. Local wheel and tarball installations are
verified separately; package license and release ownership remain open gates.
Guides: [Python](../sdk/python/README-ingestion.md) and
[Node](../sdk/typescript/README-ingestion.md).

Installed Python acceptance now runs the same synthetic LangGraph/tool/outcome
workflow from a copied quickstart outside the repository, checks that the three
Orvessian modules actually load from the wheel target, and independently verifies
signed receipts/proofs. Both source and installed integration cases pass with
the pinned framework environment; no external provider or chain calls are made.

Python queue origin/tenant/project binding is now checked before enqueue and each
delivery, including custom mutable clients. Public client scope and queue
client/capacity properties are read-only. Three new binding tests pass; the
framework/telemetry suite has 27 passes and one explicit optional-MCP skip.
All four isolated MCP tests and five source/installed-framework/telemetry/MCP
API-to-evidence integration cases pass after this change.

The [Langfuse v3 categorical connector](../sdk/typescript/README-langfuse.md) uses
explicit score-to-case linkage and label semantics. No live Langfuse credentials
or customer source content were used. V2 reads, arbitrary score-to-accuracy
conversion and broad vendor compatibility are not supported.

The new [Python OpenTelemetry exporter](../sdk/python/README-otel.md) filters before
the shared durable queue. It reads only configured instrumentation scope, root
identity/timing/status and never forwards complete spans. SDK export acceptance
means local persistence, not delivery/anchoring; SDK drops and failed capture remain
coverage gaps. No collector or GenAI semantic-convention compatibility is claimed.

The [MCP wrapper](../sdk/python/README-mcp.md) is justified by the agent/tool
governance use case. Four isolated SDK tests and two real root-to-API/signed-evidence
tests (in-memory and stdio subprocess) pass. Existing framework/telemetry tests pass with an explicit optional-MCP
skip in their environment. Arguments/results stay in the customer system; no
tool discovery, connection creation, permissions or automatic retries are added.

Webhook freshness is not replay prevention: receivers must persist delivery IDs
and reject duplicates. The signature helper is now used by a durable journal and
one-job runner, with transport policy and local receiver validation. The separate
rule engine implements local incidents; no public notification service is enabled. See
[delivery architecture and release gates](governance-webhook-delivery.md).
Nine rule/webhook tests pass, including atomic rule-to-job production and signed
derived-record evidence. See [rules, provenance and release gates](governance-rules-and-incidents.md).
The rule/incident API and portal are now implemented under explicit SQLite
GOVERNANCE_RULES_DB opt-in and governance-admin sessions; existing roles/credentials
were not upgraded. Eighteen combined API/session/review/rule/webhook tests and the
website build pass. No scanning or notification scheduler is enabled on the VPS.
Follow-on priorities: interactive portal validation, PostgreSQL rules and
production processing deployment/observability, plus aggregate tool activity/coverage reporting.

Portal increment validation: two rendered-component tests pass for absent/empty
observations, distinct outcomes/permission declarations and text escaping. The
website production build and scoped typecheck of the changed workspace panels
pass. Repository-wide typecheck still reports existing explorer Anchor.logIndex
and Cloudflare worker ambient-type errors; this is a separate release gate.

The local queue protects accepted-to-queue metadata against process restart;
it does not recover failed capture, prove all model activity was observed, or
replace encrypted backups. Keep development/testing packages separate from a
production deployment until release gates are met.

Live validation update, 27 September 2026: the OpenAI LangChain smoke path passed
with `gpt-4.1-mini`, producing an accepted decision record and valid signed
receipt/batch proof locally. One initial failed run was recorded before a successful
retry; no live anchor or VPS deployment occurred. SDK-03 is now smoke-validated for
this narrow model/path. Earlier pending-live notes below are historical checkpoints;
broader provider coverage, performance and production gates remain open.

Reviewed 27 September 2026. Work supporting [CF-01 and CF-05](roadmap-and-decisions.md#competitive-feature-backlog). SDK-00 now has a local synchronous Python alpha for deployment registration, replay-safe heartbeats and allowlisted run submission. Its local API/gateway/outbox/signing path is integration-tested. The existing JavaScript/TypeScript-area validation and verification tools remain available. Neither is a published production ingestion SDK or shipped catalogue of vendor adapters. See [client usage and limits](../sdk/python/README-ingestion.md). TypeScript ingestion, broader framework mappings and event builders remain planned; the tested Python framework matrix is documented below. The VPS soak is unchanged.

## Design objective

Decision/provider increment: explicit bounded decision codes and separate linked
outcome events now use the durable Python queue and existing reporting schema.
The OpenAI LangChain path is implemented and mock-transport tested with pinned
SDKs; a live model request remains pending a locally configured key and model.
See the [framework guide](../sdk/python/README-langchain.md). No live-provider
compatibility, human-review identity verification or production readiness claim
is made from the mock tests.

SDK-02 implementation update, 27 September 2026: a local Python LangChain/LangGraph
root-invocation adapter now connects real framework callbacks to the existing API,
registry and signed receipt pipeline. It uses a bounded durable metadata queue and
explicit delivery, with privacy/restart/concurrency coverage. Tested versions,
mapping and unsupported cases are in the [framework guide](../sdk/python/README-langchain.md).
This completes a narrow framework execution slice, not all SDK-02 or the partner
acceptance gate. Live provider instrumentation, OTel, tool/handoff/approval records
and customer outcome mapping remain planned. No VPS or public-site rollout occurred.

Let a customer add selected governance records alongside existing agent frameworks, telemetry and review tools. Start with a common event contract and customer-side mapping so each integration does not become a new data model. The table is an integration demand hypothesis, not a verified statement that every vendor exposes the required API. Confirm current SDK hooks, versions, scopes, export terms and delivery semantics before implementation.

## Prioritised integration list

Priority P0 is the first partner slice, P1 follows demonstrated demand, P2 is later expansion. Build one end-to-end partner path before every adapter in a wave. Rows describe target scope; SDK-00 and SDK-02 have partial local alpha implementations as documented above. Other integrations remain **planned**.

| ID / wave | Target | What we need to build and why | Approach / dependency |
|---|---|---|---|
| SDK-00 / P0 | TypeScript/JavaScript and Python; generic HTTPS/JSON | Supported ingestion clients, event builders, receipt retrieval/verification, retry/flush/queue controls and runnable synthetic examples | Stable versioned contract, scoped credentials, explicit server acceptance; HTTP remains the fallback for other languages |
| SDK-01 / P0 | OpenTelemetry / OTLP; OpenInference mappings | Customer-side allowlisted span-to-governance-event mapping; broad interoperability and trace correlation | Pin semantic-convention versions; collector/exporter feasibility spike; never forward entire spans or resource attributes by default |
| SDK-02 / P0 | LangChain and LangGraph, Python and JS where supported | Selected run, tool, handoff, model-version and approval observations with stable external run IDs | Supported callbacks/hooks verified per version; dependency on SDK-00; LangSmith remains the debugging view |
| SDK-03 / P0 | OpenAI API and Agents SDK; Anthropic API | Provider/model identifiers, timing, usage, tool outcomes and customer-supplied decisions | Verify current provider SDK hooks; add wrappers only where OTel cannot preserve needed semantics; never capture prompts, responses, tool arguments or tool results |
| SDK-04 / P1 | Google Gemini/Vertex AI, Azure AI/OpenAI, AWS Bedrock | Cloud deployment identity, model/version, environment and selected result metadata | Partner chooses first cloud; scoped cloud identifiers and credentials; use existing OTel mappings where adequate |
| SDK-05 / P1 | LangSmith, Langfuse, Braintrust, Arize/Phoenix | External trace references, versioned evaluation scores and adjudication provenance | Prefer dual emission from the customer's app/collector; authorised export/API import only after source review. Avoid copying raw traces and duplicate events |
| SDK-06 / P1 | Vercel AI SDK, LlamaIndex, CrewAI | Application/framework coverage beyond LangChain | Common mappings first; one compatibility-tested hook per demanded framework |
| SDK-07 / P1 | LiteLLM and customer model gateways | Routing, fallback, cost-estimate provenance and policy observations | Receive structured gateway observations; do not introduce inference proxying or runtime enforcement |
| SDK-08 / P1 | MCP client/server instrumentation | Tool identity, call status, declared approval context and correlation | Metadata at the customer's instrumentation boundary; no automatic tool discovery/access and no payload capture; MCP is not an inference provider |
| SDK-09 / P1 | Signed outbound webhooks, then Slack, Microsoft Teams and email | Route detected governance alerts and review links to responsible people | Platform connectors, not core SDK dependencies. Requires CF-04, destination authorisation, signed deliveries, retries, deduplication and delivery status |
| SDK-10 / P1 | Jira, Linear; ServiceNow after partner demand | Link exceptions to issue owner/status and import resolution references | Platform connector; opt-in write scopes, loop prevention and clear system of record. Ticket creation must be explicitly configured |
| SDK-11 / P1–P2 | GitHub/GitLab CI, JSON/CSV and customer-controlled object storage | Attach deployment/version and evaluation summaries; controlled scheduled evidence export | Start with documented CI/HTTP examples; artifact references only. Storage export needs retention/deletion policy, least privilege and export manifest |
| SDK-12 / P2 | Credo AI, Holistic AI, Fiddler; enterprise identity providers | Exchange system/control IDs and evidence references with GRC/enforcement tools; organisational login/provisioning | GRC APIs/commercial access unverified. OIDC/SAML/SCIM are platform identity work, not event SDK adapters. Implement required identity before customer launch; vendor breadth is partner-led |

Initial acceptance slice: SDK-00 plus one LangChain/LangGraph path through SDK-02, using one provider from SDK-03; validate an OTel mapping through SDK-01. Retain an external trace link without needing a commercial integration agreement. Next, choose an evaluation source from SDK-05 and one notification destination from SDK-09. This gives coverage across execution, outcome, review and evidence rather than many unmaintained wrappers.

## Contract and capture boundary

The proposed normalised envelope includes schema/adapter version; tenant/project/environment; stable event and external run/trace/span references; agent/deployment/model/configuration identifiers; customer event time and separate server receipt time; event kind/status; policy/evaluator version; explicit outcome label and provenance; optional timing, token usage and cost estimate with currency and rate/version source. These are design requirements, not a claim that the current schema supports every field. Version and review schema additions before emitting them.

Customer-side allowlists must reject unknown attributes and exclude source content before network transmission. Do not log credentials, prompts, completions, tool payloads, documents, URLs containing secrets or exception text that may contain source data. Prefer opaque source IDs; do not silently hash sensitive text and call it anonymous. Customer-configured source links require permission checks and must remain private. Structured fields need their own sensitivity and retention policy.

Operational requirements:

1. Stable event IDs across retries and adapters; conflict errors are visible. Record accepted/rejected/queued counts and do not duplicate billable events through dual emission.
2. Bounded queues, explicit overflow/backpressure policy, timeouts, shutdown flush and retry limits. Telemetry failures must be visible; never silently claim complete capture. Runtime blocking remains customer-owned and must not be an accidental SDK side effect.
3. Preserve parent/child and deployment correlation through async, streaming and multi-agent work. Sampling and dropped-event counts must remain visible; sampled data cannot support a completeness claim.
4. Separate evaluator scores, adjudicated outcomes and control observations. Keep evaluator version, denominators, unknown/conflicting labels and any sampling policy.
5. Scoped credentials, tenant/environment separation and explicit credential rotation; receipt signing keys never enter the client SDK. Trace linkage does not authenticate the source.
6. Keep the core package small; optional adapters declare supported dependency versions and avoid changing the customer's provider choice.

## Definition of supported

Every released adapter needs a named maintainer role, published compatibility matrix, synthetic quickstart, field mapping, privacy fixture (including nested and error payloads), tenant-isolation and credential tests, retry/duplicate/restart tests, bounded-queue and failure tests, streaming/correlation tests where applicable, and a full accepted-event-to-independent-verification example. Document latency/overhead measurements and unsupported cases. Package publishing, licensing, support windows and upgrade policy are release tasks; do not advertise install commands before publication.

## Reference sources and maintenance

Official references checked 27 September 2026: [OpenTelemetry GenAI conventions](https://opentelemetry.io/docs/specs/semconv/gen-ai/), [LangGraph overview](https://docs.langchain.com/oss/python/langgraph/overview), [LangSmith observability](https://docs.langchain.com/langsmith/observability), [Phoenix documentation](https://arize.com/docs/phoenix). These establish ecosystem direction; they do not certify Orvessian compatibility. Check current provider/framework documentation during each adapter design. Weekly competitor monitoring flags interface or commercial changes; monthly roadmap review chooses the next integration using partner demand, coverage and maintenance cost.
