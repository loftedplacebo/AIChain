# LangChain / LangGraph integration — local alpha

Live smoke validation, 27 September 2026: `gpt-4.1-mini` returned the expected
`review` code through the actual OpenAI/LangChain path. Event
`lc-26e9b32c-c0ee-477e-89b4-5146324c6b81` was accepted once, drained from the queue,
signed and independently checked for record commitment and batch membership.
No external anchor was submitted and the VPS was unchanged. The first attempt
recorded a failed run; its original cause was not captured by the sanitized
diagnostics. One retry succeeded. This validates this model/account smoke path,
not every model, provider reliability, accuracy, throughput or production readiness.
Earlier pending-live notes below describe the preceding implementation checkpoint.

This adapter uses the actual framework callback interface. It captures **one root
invocation** and submits selected metadata to the existing governance API. It does
not trace every tool/node or collect the customer's source content.

## Compatibility and current availability

Validated locally on Windows, Python 3.12, `langchain-core==1.6.5` and
`langgraph==1.2.12`. Exact transitive test versions are recorded in
`requirements-langchain-lock.txt`; `requirements-langchain.txt` pins direct
dependencies. These are the tested versions, not a promise of compatibility with
every previous or future release. Optional dependencies do not change the
standard-library HTTP client. This is source-distributed alpha code, not a
published package, production support commitment or live VPS deployment.

The implementation follows LangChain's [callback interface](https://github.com/langchain-ai/langchain/blob/master/libs/core/langchain_core/callbacks/base.py)
and LangGraph's [StateGraph execution interface](https://docs.langchain.com/oss/python/langgraph/graph-api).
Acceptance tests exercise installed implementations rather than mocked callbacks
alone. A fake chat model and synthetic graph node avoid inference costs or external
provider credentials; live OpenAI/Anthropic integration is a separate gate.

## Run the complete example

Create an isolated Python environment and install the test dependencies:

```text
python -m venv build/framework-venv
build/framework-venv/Scripts/python -m pip install -r sdk/python/requirements-langchain-lock.txt
```

Use the environment's `bin/python` path on Unix. Set the four `ORVESSIAN_*` client
variables described in [the ingestion guide](README-ingestion.md), and set
`ORVESSIAN_QUEUE_PATH` to a local SQLite file in a customer-controlled directory.
Then run `examples/governance-langgraph.py` with that Python executable. The
example registers a synthetic deployment and submits one actual graph execution.
It deliberately disables external LangSmith tracing and prints identifiers and
delivery counts, never the input/output. It does not send a heartbeat: reporting
activity and liveness remain separate signals.

Integration in a customer application:

```python
from uuid import uuid4
from orvessian_langchain import DeliveryQueue, GovernanceCallback

queue = DeliveryQueue("governance-pending.sqlite", client, capacity=1000)
handler = GovernanceCallback(
    queue, run_id=uuid4(), agent_ref="claims-agent", environment="test",
    deployment_ref="claims-v1", provider_ref="configured-provider",
    model_ref="configured-model", config_version="v1",
    task_class="workflow-invocation",
)
try:
    result = graph.invoke(customer_input, {
        "callbacks": [handler], "run_id": handler.run_id,
    })
finally:
    # Surface this status in customer monitoring, even if the graph raises.
    capture_status = handler.capture_status
    # Flush outside the framework execution; handle delivery errors explicitly.
    # A production application may call flush from its own delivery worker.

acknowledged = queue.flush(limit=100)
pending = queue.pending
queue.close()
```

Use one new handler/run UUID for each invocation attempt. Preserve the framework
run UUID in the customer's own trace system. A graph resume is a separate
invocation, so it needs a new UUID. Do not re-execute an agent just to retry
delivery: reopen the same queue with the same API/tenant/project and call `flush`.
Registration and heartbeats are explicit client operations, never inferred from
framework callbacks. The application remains responsible for queue lifecycle and
for checking `capture_status` and pending count on every invocation/shutdown.

## Field mapping and meaning

Decision/outcome increment: configure `case_ref` and a fixed `decision_labels`
vocabulary (at most 32 codes), then call `handler.set_decision(code)` once inside
the running workflow after customer-side parsing. A successful root records that
code as `predictedLabel` and `decisionCode`; failed roots do not retain predictions.
There is still no automatic output extraction by the callback. The optional
OpenAI example explicitly maps its response to the configured codes on the
customer side. Unknown, refused or truncated responses fail that mapping.

Later, submit an independent record with `queue.enqueue_outcome(event_id=...,
for_event_id=..., case_ref=..., environment=..., label=..., label_source=...,
evaluator_ref=..., rubric_version=..., occurred_at=...)`. Persist all values before
retrying. Outcomes use the same durable queue and never rewrite the run. The
profile, tenant, project, environment and case must match for reporting eligibility.
Automated evaluator labels remain excluded from adjudicated accuracy; human or
calibrated sources are customer assertions, not independently authenticated reviewer
identities. Sample-size, conflicting-label and mixed-rubric gates still apply.
This is ingestion support, not yet a portal review workflow or provenance upgrade.

Run `examples/governance-langgraph.py --with-outcome` for a synthetic automated
evaluation example; it deliberately does not pretend to be human ground truth.

### Optional OpenAI path

Install `requirements-provider-lock.txt` in the isolated Python environment for
the tested provider stack (`langchain-openai==1.6.6`, `openai==3.19.2`). Provider
contract tests run actual SDK code with an HTTP mock; they do not prove live
account access or model compatibility. The live gate is pending a local key and
model selection. `examples/governance-openai.py --live --env-file PATH` performs
one bounded synthetic Chat Completions request and submits only a mapped code.
The optional env file accepts only `OPENAI_API_KEY` and `OPENAI_MODEL`.

For a self-contained local smoke run, put those settings in Git-ignored
`build/provider-smoke.env`, then run `node scripts/governance-provider-smoke.cjs --live`.
It provisions an isolated local governance API and ephemeral recording signer,
verifies the record and batch proof, and retains results under an ignored
`build/provider-smoke-*` directory. It does not restart the VPS or broadcast an
anchor. No key, provider error text or source payload is logged. It makes at most
one provider request with a 20-second timeout, no provider retries and a 128-token
completion cap. Failure may retain a failed run, but does not invent a decision.

The smoke uses `store=false` as described in the
[official API guidance](https://developers.openai.com/api/docs/guides/migrate-to-responses).
This is not a zero-retention guarantee for the model provider. Source text is sent
to the chosen inference provider as required for inference, never to Orvessian.
The smoke prompt is synthetic; it does not import customer conversations.

| Governance field | Source |
|---|---|
| eventId / streamRef | `lc-` plus configured framework root run UUID |
| runRef | Framework root UUID; opaque correlation, not a public trace URL |
| sequence | `0`, because each root invocation has its own one-event stream |
| agent/environment/deployment/model/config/task | Explicit validated customer configuration |
| occurredAt | Adapter UTC terminal callback time |
| receivedAt | Assigned by the API |
| status | `completed` on root return, `failed` on root exception callback |
| latencyMs | Local monotonic root duration, capped at one day |
| source.integrationVersion | `langchain-python-0.1.0-alpha` |

No prompts, chat messages, output values, tokens, exception text, tool arguments,
serialized graph definitions, tags, arbitrary metadata or child-node payloads are
read into records. Configured references must be opaque and non-sensitive; the
adapter cannot determine whether a customer misuses a reference field.

`completed` means the invocation returned. It does not mean a decision was correct,
a policy was obeyed, a resumed workflow is finished, or an agent is safe. Model and
provider identity are configured assertions, not observed attestations. Approval,
tool/handoff, evaluator and checkpoint semantics need separate event mappings.
Independent trace services may capture source content under their own settings;
this adapter neither configures nor guarantees the behavior of other callbacks.

## Delivery and failure behavior

Callbacks perform a small local SQLite write and no network request. The queue is
bound to API origin, tenant and project; credentials are not persisted. Protect
the directory using OS permissions and encryption/retention policies. Queue size
defaults to 1,000 pending records (configurable 1–10,000), with 64 KiB per metadata
record. This bounds logical pending data; SQLite/WAL disk allocation is not a hard
byte quota. Use one queue per project; do not place SQLite on a network share.

Only a matching accepted/duplicate event acknowledgement removes a queued row.
Timeouts, crashes after API acceptance, conflicts and unexpected acknowledgements
retain the exact metadata for retry. `flush` stops at the first error; resolve
conflicts explicitly without rewriting accepted evidence. A changed credential
for the same project can drain the queue after rotation. Changing API/project
requires an explicit migration, not silent delivery into another tenant.

Capture statuses are `not-started`, `running`, `queued`, `capture-failed`. A full
queue/disk failure does not stop inference but sets `capture-failed`; the current
record was not retained and must be treated as missing coverage. Queued records
survive restart. A crash before the terminal callback is not durably recorded;
there is no completeness guarantee or automatic recovery of an in-flight run.
Interrupted/cancelled streams must not be interpreted as completed business work.
The caller should fully consume streams and inspect capture status even on error.

Supported tests cover root pipelines/graphs, sync and async invoke/stream, nested
runs, a streamed fake chat model, error privacy, concurrent roots, replay, restart,
scope binding and overflow. Direct standalone model callbacks, multi-agent child
trees beyond the bounded root descendant tracking, separate node/tool events,
checkpoint/resume semantics, token/cost extraction,
production overhead budgets and live provider compatibility are not yet supported
acceptance claims. Local disk writes can delay callbacks; production performance
measurements remain required.

## Acceptance checks

Decision/provider increment validation: 17 Python tests and 29 governance/framework
tests passed. The expanded framework test signs and checks both run and outcome,
and verifies automated-label exclusion, case matching and insufficient-sample
suppression. OpenAI SDK HTTP behavior was tested with a mock transport only;
live provider validation is still pending local credentials/model selection.

27 September 2026 local result: **14 Python tests and 29 governance/integration
tests passed**, including the real framework-to-receipt round trip. Runtime:
Python 3.12.14 on Windows. No external provider call or blockchain transaction
was made; these results establish local alpha behavior, not production throughput.

```text
python -m unittest discover -s sdk/python -p "test_orvessian*.py" -v
```

Set `ORVESSIAN_FRAMEWORK_PYTHON` to that Python executable, then:

```text
node --test services/governance/framework-ingestion.integration.cjs
```

This separate optional integration test runs the actual example against an isolated
local API. It checks accepted metadata, registry correlation, tenant isolation,
signature/commitment/batch membership and tamper rejection. It does not broadcast
a transaction or claim a fresh Base confirmation. Existing Base/reorg tests remain
the chain-verification regression suite. Set `ORVESSIAN_TEST_PYTHON` when running
the core governance suite if Python is not on PATH.

## Opt-in tool callbacks — 28 September 2026

Real tool callbacks under the configured root invocation, including nested chain
nodes, are now supported with a fixed catalogue:

```python
handler = GovernanceCallback(queue, run_id=run_id, **identity,
    tool_catalog={'customer_lookup': {'toolRef':'case-lookup', 'version':'v1'}})
```

Only serialized `name` is read to select this catalogue. Descriptions/schema,
input strings, arguments, returned values, exception text and metadata are never
inspected or serialized. Raw tool names are not persisted; configured opaque
toolRef/version are stored. Keep catalogue references free of source content.
Completed/failed observations are attached to the root `activity.toolCalls`;
unfinished tools remain `pending`. Successful execution does not prove permission
or enforcement, and the adapter never infers `allowed`.

Unknown tools are excluded and set `tool_capture_status='unmapped'`; limits of
100 tools or 1,000 root/chain identities set `limited`. Initial status is `enabled`
or `disabled`. Inspect this alongside capture_status. These are local coverage
signals, not yet persisted portal completeness metrics. The portal review and
evidence views display supplied tool outcomes and distinguish customer-declared
permissions from control enforcement. Missing observations do not imply inactivity.
Duplicate callbacks do
not rewrite outcomes; unrelated parents and late callbacks are ignored. Separate
tool identities/timing, standalone tool roots, handoffs, approvals, checkpoint/
resume and complete multi-agent tracing remain unsupported.

The queue bound is now 64 KiB, matching the event API. Maximum logical pending
storage is roughly 625 MiB at 10,000 full-size records, before SQLite/WAL overhead.
Provision customer disk capacity; the larger bound still excludes source payloads.

Validation: 21 Python tests passed, covering actual sync/async tool invocation,
failure, source exclusion and limits. The synthetic LangGraph tool example reaches
an isolated tenant API and independently checked signed receipt/batch evidence;
changing its tool outcome fails verification. This proves local functionality,
not production throughput or complete observation coverage. Earlier no-tool
checkpoints above describe the earlier adapter.
