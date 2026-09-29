# Langfuse score reader/mapping — local alpha

28 September 2026. This customer-side Node connector reads the **Scores API v3**
schema and maps categorical scores to linked governance outcome records. Current
official docs identify v3 as the supported score-read path; v2 compatibility is
not implemented. No Langfuse account, credentials or live service was used in
validation. This is not a claim of broad Langfuse tracing/debugging compatibility.

```js
const {LangfuseScoresClient,mapLangfuseScorePage}=
 require('@orvessian/ingestion/orvessian-langfuse');
const {DurableQueue}=require('@orvessian/ingestion/orvessian-queue');
const reader=new LangfuseScoresClient({baseUrl:'https://cloud.langfuse.com',
 publicKey:process.env.LANGFUSE_PUBLIC_KEY,secretKey:process.env.LANGFUSE_SECRET_KEY,
 scoreName:'decision-label',environment:'production'});
const page=await reader.page({from:'2026-09-01T00:00:00.000Z',
 to:'2026-09-02T00:00:00.000Z',after:null});
const {events,nextCursor}=mapLangfuseScorePage(client,page,[
 {subject:{kind:'observation',id:'observation-1',traceId:'trace-1'},
  forEventId:'accepted-decision-1',caseRef:'customer-case-1'}
],{environment:'production',vendorProjectId:'langfuse-project-1',
 evaluatorRef:'customer-langfuse-evaluator',rubricVersion:'v1',scoreName:'decision-label',
 labelMap:{approve:'approved',reject:'rejected'}});
const queue=new DurableQueue(client,'./customer-evaluations.sqlite');
for(const event of events)queue.enqueue(event);
// Persist the cursor and fixed mapping/window configuration only after every
// event from this page is safely queued; do not advance on partial failure.
await queue.flush();
queue.close();
```

## Semantics and privacy

The reader requests only core score fields plus `fields=subject`, filtered to one
score name/environment, CATEGORICAL type, a bounded timestamp window and at most
100 results. It never requests traces, observations, details, annotations,
comments or raw source content. A subject can be trace-level or observation-level;
observation links include traceId because observation IDs are scoped by trace.
Session/experiment subjects are currently rejected.

The customer supplies explicit links to already accepted forEventId/caseRef and
a fixed categorical labelMap. The converter enforces project, environment, name,
type, category, timestamp and unique subject linkage before emitting any events.
It rejects duplicates/ambiguous links, unexpected/missing score subjects and
unmapped labels rather than choosing a case or label by inference. A trace-level
score must deliberately map to one case/run; it is not copied to every span.
Numeric/boolean/free-text/correction scores need separate agreed semantics and
are rejected. This connector does not translate an arbitrary score into accuracy.

Even vendor annotations are identified as **automated-evaluator** in this alpha:
vendor author/source fields do not establish an authenticated Orvessian human
reviewer or a calibrated measurement. Labels remain outside the portal's
human-adjudicated accuracy. This conservative provenance choice needs an explicit
identity/rubric bridge before accepting a different labelSource.

Comments, metadata, author references, names of raw traces and content are not
copied or persisted in governance records. Unexpected server fields are ignored
by the converter; the bounded read response stays in customer process memory.
Do not log or persist raw returned pages, and do not put source content into
structured references or configured normalized labels. Keep keys customer-side;
the recording service does not need Langfuse credentials.

## Identity, delivery and updates

Score identity binds Langfuse project/score ID plus Orvessian scope and configured
evaluator/rubric version. Retries are stable and deduplicate. Langfuse scores can
change under an existing ID; a changed mapped label, linked case or timestamp
produces a visible governance conflict rather than updating accepted evidence.
Do not silently create new event identities to conceal revisions. A future
revision importer must preserve explicit supersession/source revision provenance.
Retain the customer link/mapping/rubric configuration for reconstruction; this
alpha does not sign the vendor score or attest its external provenance.

Pagination cursors are opaque and bounded. For resumable imports use
`importLangfuseWindow` from `@orvessian/ingestion/orvessian-langfuse`:

```js
const result=await importLangfuseWindow(client,reader,queue,{
 importId:'correctness-window-001',from:'2026-09-27T00:00:00.000Z',
 to:'2026-09-28T00:00:00.000Z',links,options,maxPages:10
});
await queue.flush({limit:100});
// Reinvoke with identical configuration to resume, until checkpoint.complete.
```

Each whole page and its checkpoint commit atomically in the queue database.
Capacity, identity collision or stale-writer failures roll back both. The binding
hash includes source/API origins, tenant/project, fixed window, explicit links,
label mapping and evaluator/rubric configuration. Changing that configuration
under the same importId fails before fetching. Credentials and raw score pages
are not persisted. The reader's filter/origin properties are immutable.
At most 100 checkpoint identities are retained per queue, 100 records per page,
1–100 pages per call (default 10), and 10,000 pages per import. No checkpoint
cleanup is automatic; archive a consistently backed-up queue before starting a
fresh one if this alpha limit is reached. Cursors that do not advance or cycle
within one call fail visibly. Caller-owned link/mapping inputs are snapshotted
before reads. Records outside the configured timestamp window are rejected.

Completion means filtered records were saved locally, not delivered or anchored.
An empty terminal page completes the fixed import. Completed imports are not
refetched: late-arriving/edited scores require explicitly scheduled overlapping
windows and stable source identity; edits still surface as immutable conflicts.
The vendor pagination API is not a snapshot/completeness guarantee. A scheduler,
late-arrival policy and source revision handling remain rollout decisions. Direct
manual `mapLangfuseScorePage` plus individual `enqueue` calls still require the
caller to manage partial pages/checkpoints. No background daemon is started.

Transport uses HTTPS except explicit loopback development, Basic authentication
in private fields, redirect refusal, a bounded timeout and 2 MiB response limit.
Errors reveal status only, not keys or vendor body. No automatic retry: handle
429/transport failures with the same cursor and window, without advancing state.
URLs must be origins; use the configured self-hosted origin if appropriate.

## Validation and remaining gates

Five tests cover atomic rollback, restart/checkpoint resumption, scope/configuration
binding, stale writers, schema/privacy/links, mutable-score conflict, automated-label
exclusion, request filters, cursor/status/size/redirect handling and a local fake
Langfuse HTTP endpoint → durable queue → real tenant API → signed receipt/batch.
TypeScript declarations compile strictly. This demonstrates integration plumbing,
not live vendor access, complete score collection or production readiness.
Before rollout: verify the customer's deployed v3 schema/version, API permissions,
rate limits, mapping/rubric agreement, checkpoints and update handling. Do not
advertise numeric evaluation support or vendor-verified accuracy.

Primary references checked 28 September 2026:
[Langfuse Scores API v3](https://langfuse.com/docs/api-and-data-platform/features/public-api#scores-api-v3),
[v3 migration](https://langfuse.com/changelog/2026-06-10-scores-v3-api).
