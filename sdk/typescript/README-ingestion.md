# Node/TypeScript ingestion — locally packaged alpha

Node 22.13+; CommonJS with TypeScript declarations, no runtime dependencies.
Local package `@orvessian/ingestion@0.1.0-alpha.1` is not published. Build with
`npm pack ./sdk/typescript --pack-destination ./build/sdk-packages` from the repo.
Install the resulting local archive in an isolated customer test project; do not
use a registry installation command before publication. Licensing, release owner,
support windows and broader version testing remain release gates.

```javascript
const {Client}=require('@orvessian/ingestion');
const client=new Client({baseUrl:process.env.ORVESSIAN_API_URL,
 token:process.env.ORVESSIAN_TOKEN,tenant:'example',project:'pilot'});
// Persist the complete record identity and timestamp before submission/retry.
const event=client.buildRun({eventId:'run-event-1',streamRef:'run-event-1',sequence:'0',
 occurredAt:'2026-09-28T00:00:00.000Z',runRef:'run-1',agentRef:'agent-1',
 environment:'test',deploymentRef:'deployment-1',providerRef:'synthetic',
 modelRef:'model-1',configVersion:'v1',taskClass:'classification',status:'completed',
 caseRef:'case-1',predictedLabel:'review'});
const acknowledgement=await client.submit(event);
```

`registerAgent`, `heartbeat`, `agents` and `evidence` use the existing scoped API.
Only HTTPS origins are accepted outside loopback. Redirects are refused. Default
timeout is 10 seconds per attempt; three attempts with bounded backoff; 1–5
attempts and at most 60 seconds each are configurable. Responses are bounded to
2 MiB. Retryable errors: transport, 408/429/500/502/503/504. Conflict and redirect
failures do not retry. Errors contain no response bodies or credentials. Client
credentials are private class fields. Event acknowledgements must match the ID
and accepted/duplicate status. Optional durable delivery is described below;
there is no background thread or automatic recovery scheduler.
API evidence retrieval does not itself independently verify the evidence.

## Outcomes and configuration observations

`buildOutcome` / `recordOutcome` accept only eventId, forEventId, caseRef,
environment, label, labelSource, evaluatorRef, rubricVersion and occurredAt.
Persist IDs and the UTC millisecond timestamp before retrying. Supported label
sources are automated-evaluator, customer-feedback, downstream-system and
calibrated-measurement. Human adjudication belongs to the authenticated review
workflow. These declarations do not authenticate an evaluator or establish
calibration; automated outcomes remain excluded from adjudicated accuracy.

`buildConfigObservation` / `recordConfigObservation` accept event/stream identity,
sequence, timestamp, agent/environment/model/deployment references, configVersion,
required observedConfigDigest and observationSource, optional approvedConfigDigest
and parentEventRefs. Digests must be lowercase bytes32 hexadecimal values. Hash
the customer-held canonical configuration locally; send no configuration text.
The SDK records customer-declared observations, not independent runtime
attestation or proof that approved settings were enforced. Both builders return
validated records suitable for the same durable queue and receipt pipeline.
The API origin, tenant, project and transport bounds are immutable at runtime.

## Durable Node delivery

```js
const {DurableQueue}=require('@orvessian/ingestion/orvessian-queue');
const queue=new DurableQueue(client,'./customer-governance.sqlite',{capacity:10000});
queue.enqueue(event); // persists before network delivery; stable identity required
await queue.flush({limit:100}); // explicit; stops on first failure, retaining records
queue.close();
```

One queue belongs to one API origin/tenant/project. SQLite WAL with FULL synchronous
commits survives process restart; capacity is bounded to 100,000 records maximum,
with a 64 KiB per-record limit. Use encrypted customer storage and restrictive OS
permissions: metadata can still be sensitive. No credential is persisted. Duplicate
queued bytes are a no-op; changed bytes under the same identity are rejected.
Acknowledged records are deleted; a crash after API acceptance replays the original
event and relies on server deduplication. This is at-least-once delivery, not an
exactly-once network guarantee. A permanent rejection blocks that flush: repair
the underlying issue explicitly rather than silently dropping evidence. Callers
must handle capacity failures and schedule retries. Concurrent processes may send
duplicate events; overlapping flush/close on the same instance is refused. Queue
files are local development artifacts, not server backups. Node's built-in SQLite
API remains experimental on the tested Node 24.14.1 runtime; wider runtime testing
is a release gate.

Run builders reject unknown fields. Tool metadata supports at most 100 explicit
`{toolRef,version,resultCode,allowed?}` observations, optional action codes and
parent event references. No arguments/results are captured. This is explicit
customer instrumentation, not automatic framework tool/handoff/approval capture.

## Customer-side mappings

Import `@orvessian/ingestion/orvessian-mappings` for `mapOtlpSpan` and
`mapEvaluationRows`. Both return validated events; submit them explicitly.

OTLP mapping accepts one completed JSON Span with hexadecimal nonzero trace/span
IDs, nanosecond timestamps encoded as decimal strings, and an explicit OK/ERROR
status. Unset status is rejected rather than inferred successful. Timing is
rounded down to milliseconds. Stable event IDs bind tenant/project/environment
and trace/span; the trace reference is preserved in `runRef`. Customer context
explicitly supplies model, deployment and task identities. Context changes for
the same span cause a visible server conflict, not a second silent event.
Names, attributes, resource fields, links, events, exception text and status
messages are ignored before serialization. This is a narrow mapping, not an
OTLP receiver, collector/exporter plugin, GenAI/OpenInference attribute adapter
or completeness claim. Source schema reference checked 28 September 2026:
[OTLP trace protocol v1.9.0](https://github.com/open-telemetry/opentelemetry-proto/blob/v1.9.0/opentelemetry/proto/trace/v1/trace.proto).

Evaluation import accepts at most 500 normalized rows, each containing only
evaluationId, forEventId, caseRef, label and occurredAt, with explicit environment,
evaluatorRef and rubricVersion. It always identifies labels as automated evaluators,
which are excluded from human-adjudicated accuracy. Stable evaluation IDs include
evaluator/rubric scope; immutable retries deduplicate. No vendor API, raw traces,
scores or content are fetched by this generic mapper. Named-source converters and
provenance reviews are required for vendor claims; the narrow Langfuse slice below
does not establish broad Langfuse/LangSmith/Braintrust/Arize support.

The local [Langfuse v3 connector](README-langfuse.md) now implements a narrow
categorical score reader/converter with explicit record links and privacy filtering.
It is tested against mocked/local HTTP, not a live vendor account; other named
evaluation vendors and broad Langfuse feature coverage remain unsupported.

Validation: `node --test sdk/typescript/orvessian-*.test.js`. Tests cover privacy,
scope, bounds, redirects, retries, acknowledgement identity, source-free mappings,
automated-label exclusion and actual API/registry/signed-evidence integration.
