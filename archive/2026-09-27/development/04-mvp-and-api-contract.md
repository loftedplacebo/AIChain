# MVP and API contract proposal

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

14 September 2026 · Design contract for review · None of the proposed HTTP endpoints below is represented as currently available

## User journey and scope

The developer accepts an invitation, provisions a project and API key, installs a versioned Python package, configures the network/batch destination and local signing/evidence adapter, records one selected event, receives a durable submission ID, waits or polls for confirmation, retrieves an export and checks it through a separate node. The customer does not acquire test tokens for the managed route.

Include account/key creation, selected-event capture, exact-byte commitments, customer-held evidence, customer signature, durable submission/retries, status, receipt retrieval/export and basic usage. Exclude a broad dashboard, runtime permission enforcement, full model execution proofs, automatic capture of every span, billing automation, bridge and consumer token flows.

Manual invite/account provisioning is acceptable initially. The service must still have real tenant isolation, key revocation and a stable developer workflow; manually editing a shared configuration file is not a substitute for those controls.

## Proposed API surface

| Method / path | Purpose | Required behaviour |
|---|---|---|
| `POST /v1/verifications` | Accept a signed receipt/presentation for anchoring | API key + idempotency key; durable `202`; no raw evidence required |
| `GET /v1/verifications/{id}` | Submission and check status | Tenant-scoped, non-sensitive result; no promise implied by ID |
| `GET /v1/verifications/{id}/export` | Download verification material | Tenant or scoped disclosure authorization; omit private evidence by default |
| `POST /v1/verifications/{id}/validate` | Re-evaluate named supported checks | Explicit policy/version, evaluation time and source; bounded workload |
| `GET /v1/verifications?agent_id=...` | Tenant history | Opaque agent ID, bounded pagination and time filters |
| `GET /v1/usage` | Usage/limits summary | Stable logical-event units, no private context |
| `POST /v1/api-keys` / revocation endpoint | Key administration | Authenticated account administration; never ordinary submission-key privilege |

Self-service account APIs are implementation choices after identity-provider selection. Public protocol verification remains possible without these company endpoints. Public explorer projection is a separate read service with a strict field allow-list; the tenant endpoint does not become public just because receipt IDs are hashes.

## Request and response semantics

The transport accepts the existing signed presentation plus a client event key. SDKs handle the underlying profile/destination construction. `Idempotency-Key` is scoped to tenant and operation. The server stores a digest of the complete accepted body and the resulting submission ID atomically. Reusing the key with changed bytes returns `409`; a byte-identical retry returns the original job. The deduplication retention horizon must cover all retry/outbox horizons and remain documented; persistent event mapping prevents charging again after an HTTP cache expires.

Example proposed response shape (illustrative, not a live record):

```json
{
  "verification_id": "vr_example",
  "submission_state": "accepted",
  "receipt_id": "<derived receipt hash>",
  "network": {"environment": "private-testnet", "epoch": "<manifest id>"},
  "anchor": null,
  "checks": {
    "signature": {"status": "passed", "verifier_version": "<pinned version>"},
    "inclusion": {"status": "unchecked"},
    "evidence_integrity": {"status": "unchecked", "reason": "customer-held"},
    "authority": {"status": "unsupported"},
    "policy_proof": {"status": "unsupported"}
  }
}
```

HTTP success describes the service operation, not the truth of the AI event. `validate` can return HTTP 200 with failed or unavailable checks; authorization/input/service failures use appropriate HTTP errors. Include a stable error code, retryability, correlation ID and safe user message. Do not log payloads to make debugging convenient.

Proposed errors: `400` malformed or duplicate-key JSON; `401` missing/invalid/revoked key; `403` insufficient scope; `404` resource missing or inaccessible under non-enumerating policy; `409` idempotency mismatch; `413` oversized request; `422` invalid schema/signature/destination; `429` tenant quota with retry guidance; `503` unable to durably accept. Unknown protocol/profile versions fail explicitly. Treat validation requests as resource-consuming and quota them separately.

## SDK shape and honest examples

Prefer verbs that separate recording from verification: `record_event`, `get_verification`, `wait_for_confirmation`, `export_verification`, `verify_export`. A convenience `verify` must never imply AI correctness or chain confirmation before the requested checks finish. Package naming is unresolved; do not publish `pip install verifier` in website copy as if an official release exists.

Proposed flow in words: encode selected output bytes; persist private evidence/opening; create/sign receipt; submit with stable event/idempotency key; receive accepted ID; poll to a chosen depth with a timeout; export; independently verify. On timeout return the last known state and job ID. Never retry the underlying AI business action merely because the verification API timed out.

Keep capture asynchronous by default with a durable bounded local queue. The application chooses whether inability to record evidence blocks a business action. A mandatory approval or audit checkpoint may require fail-closed behaviour, but this is a runtime/product policy, not a chain feature. Expose queue overflow, dropped capture and degraded recording as observable failures; do not silently lose selected events.

## Framework adapter sequence

1. Generic Python application: the stable contract around a selected completed business event.
2. OpenAI Agents SDK: wrap business event/tool completion and explicit approval boundaries; assess tracing integration after the core contract works.
3. MCP: capture at the runtime/tool host boundary; a model voluntarily calling a verification tool is not complete audit capture.
4. LangGraph/LangChain or CrewAI: choose the next integration from actual partner requests and supported maintenance capacity.

Official OpenAI documentation describes Python/TypeScript SDKs and application-owned runtimes. Its tracing documentation covers run, model, tool, handoff and guardrail records. These are relevant capture surfaces, not independent attestations of truthful model execution. [Agents SDK](https://developers.openai.com/api/docs/guides/agents/sdk), [integrations and observability](https://developers.openai.com/api/docs/guides/agents/integrations-observability).

Implementation proposal: pin the exact tested SDK version, select explicit events, redact before capture, and keep provider tracing settings distinct from Orvessian evidence policy. Do not auto-export raw prompts, model outputs, hidden reasoning or credentials. The specific hook/processor API requires a version-specific spike; the documentation reviewed here does not settle it.

Adapter acceptance includes nested tools, async runs, streaming completion, cancellation, retry, process shutdown, concurrent sessions and duplicate delivery. Preserve causality/event IDs. Do not alter tool results or agent orchestration to make verification succeed. Test an exported package without the adapter installed.

## End-to-end acceptance matrix

| Scenario | Expected result |
|---|---|
| Valid customer-signed event | Durable acceptance, actual batch inclusion, independently checkable export |
| Network unavailable after capture | Evidence retained; pending status; bounded retry; AI action not repeated |
| Crash after broadcast but before status update | Worker reconciles nonce/hash; one logical action and charge |
| API retry or framework duplicate | Same event/job mapping; no new salt or duplicate bill |
| Evidence or salt lost | Evidence check unavailable/failed as appropriate; inclusion may still pass |
| Wrong signature/profile/destination | Rejected or explicit failed check; no elevated assurance |
| Unsupported ZK/authority claim | Unsupported, never silently treated as verified |
| Reorg after confirmation | Downgraded state with history; recovered same commitment; corrected usage |
| Cross-tenant request | Denied without leaking receipt context |
| Service disabled after export | Reviewer verifies supported properties via own tools/node |
| Testnet reset | Original network epoch retained; old record not silently relocated or re-signed |

## Proposed reliability targets

Measure p50/p95/p99 for capture, durable acceptance, queue wait, inclusion, depth confirmation and export separately. The ten-minute onboarding KPI spans documented setup through a first independently checked record and must disclose account/network waiting time. A local unanchored example has a separate timer.

Proposed pilot recovery objectives: no acknowledged outbox-record loss (RPO zero for accepted jobs under tested failure scope), restoration of the service within four hours in a rehearsed incident, and no more than one business day for acknowledged partner support. These are engineering targets pending architecture/staffing validation, not contracted SLAs. Network inclusion cannot be guaranteed during consensus outage; status and custody obligations still apply.
