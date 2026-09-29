# OpenTelemetry exporter — locally tested alpha

28 September 2026. Python OpenTelemetry SDK/API **1.45.0**, semantic-conventions
**0.66b0**, Python **3.12.14**. This exporter connects actual completed SDK spans
to the same bounded customer-side metadata queue as the LangChain adapter.
It is not an OTLP collector receiver or automatic GenAI/provider instrumentation.

Install the local wheel with optional `[otel]` extra, or the pinned
`requirements-otel.txt` into a development environment. The base ingestion/queue
modules do not require LangChain or OpenTelemetry; telemetry imports are optional.

```python
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.trace import Status, StatusCode
from orvessian_delivery import DeliveryQueue
from orvessian_otel import GovernanceSpanExporter

queue = DeliveryQueue('customer-metadata.sqlite', client)
exporter = GovernanceSpanExporter(queue, instrumentation_scope='governance-tracer',
    agent_ref='agent-1', environment='test', deployment_ref='deployment-1',
    provider_ref='configured-provider', model_ref='configured-model',
    config_version='v1', task_class='classification')
provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(exporter))
with provider.get_tracer('governance-tracer').start_as_current_span('customer-local-name') as span:
    # Run the customer operation here. Mark success only when known.
    span.set_status(Status(StatusCode.OK))
provider.force_flush() # SDK buffer → committed local metadata queue
print(exporter.metrics)
queue.flush()          # Explicit API delivery; handle failures/backpressure
provider.shutdown()    # Stops exporter; does not delete or close queue
queue.close()
```

Use the BatchSpanProcessor for normal integration so local disk work is off the
span-completion thread. The SimpleSpanProcessor is functionally tested but runs
the local write synchronously. SDK buffering/sampling and process failure before
queue acceptance can lose spans; SDK processor drop telemetry needs independent
monitoring. Do not infer complete capture from exporter counters.

## Privacy and mapping

The exporter reads only instrumentation-scope name to match the fixed configured
scope, root/parent identity, trace/span IDs, start/end times and OK/ERROR status.
It never reads/serializes span name, attributes, resource attributes, events,
links, status descriptions or arbitrary source payloads. This filters before
persistence or network submission. The fixed caller configuration supplies model,
agent, deployment and task identity; it is not provider-attested identity or
automatic discovery. Configure a dedicated instrumentation scope per homogeneous
identity/task profile; do not reuse one exporter across distinct model deployments.

Only parentless spans are accepted. Child spans and remote-parent roots are
excluded to avoid counting nested work as separate model runs. General distributed
trace coverage, parent correlation, tool/agent handoffs and semantic attribute
mapping need further work. Sampling may remove spans before this exporter sees them.

UNSET is not interpreted as successful execution: it increments missing_status
and returns export failure. ERROR creates failed status; OK creates completed.
No source output or decision labels are inferred. Timing is floored to milliseconds,
bounded to one day, with occurrence time taken from span start. Event identity
binds tenant/project/environment/trace/span, matching the existing Node OTLP
identity formula. Stream identity is per span, sequence zero, runRef preserves
the opaque trace ID. SDK and OTLP mapping integration versions differ; choose one
submission path per span rather than mixing both under the same event ID.

## Delivery, counters and limits

`export` succeeds when selected records are committed to the local queue, not when
API receipts or Base anchoring are confirmed. API delivery remains explicit and
inherits exact metadata replay, scope binding, capacity limits and matching
acknowledgements. Queue is at most 10,000 pending records and 64 KiB per record;
OS encryption/permissions and disk provisioning remain customer responsibilities.
There is no durable raw-span buffer or automatic recovery of failed capture.

Per-exporter counters: seen, queued, skipped_scope, skipped_child, missing_status,
failed. These count export attempts, not unique model runs; replay can increase
queued while the local queue/server still deduplicate identities. Queue failure
returns FAILURE and retains records already committed earlier in that batch;
do not assume the SDK retries failed exports. Counters are local process state,
not durable portal completeness metrics. `last_event_id` is the most recently
queued identity for diagnostics, not a full inventory. Inspect failures/drops.

The exporter accepts batches up to 512 spans, rejects invalid timings/contexts,
and never retains exception text on capture failure. force_flush waits for local
export work within its timeout (at most 60 seconds); it never drains API pending
records. Shutdown preserves the shared customer-owned queue for later recovery.

## Validation and references

24 Python tests pass, including real SDK root/child/foreign-scope spans, synthetic
private attributes/events/resources/error descriptions, unset status, replay,
queue overflow and the actual BatchSpanProcessor flush path. The real SDK example
also reaches the tenant-scoped API and independently verified signed receipt/batch
proof; changing latency fails verification. LangGraph's signed-evidence round trip
continues to pass after extracting the framework-neutral queue.

```text
python -m unittest discover -s sdk/python -p "test_orvessian_*.py"
# Set ORVESSIAN_FRAMEWORK_PYTHON to the environment above, then:
node --test services/governance/otel-ingestion.integration.cjs services/governance/framework-ingestion.integration.cjs
```

This does not establish production overhead/throughput, wider Python/SDK versions,
GenAI/OpenInference compatibility, provider hooks or OTLP collector support.
Primary interface reference checked 28 September 2026:
[OpenTelemetry Python export interface](https://opentelemetry-python.readthedocs.io/en/latest/sdk/trace.export.html).
