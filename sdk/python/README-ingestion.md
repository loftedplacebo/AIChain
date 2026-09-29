# Python ingestion client — local alpha

Optional framework integration is now available locally: see the
[LangChain/LangGraph guide](README-langchain.md). The base client remains synchronous
and standard-library-only; framework-neutral durable queuing is in
`orvessian_delivery`. Actual span export is covered in the
[OpenTelemetry guide](README-otel.md). Its
allowlisted `integration_version` parameter identifies the adapter in receipts.

The optional [MCP wrapper](README-mcp.md) now attaches configured tool status to
an existing agent root without forwarding arguments/results or counting tools
as additional model runs. It uses a separately pinned SDK acceptance environment.

`orvessian_ingest.py` uses the standard library. This is a synchronous source-distributed
alpha with a locally built wheel, not a published production package. Python 3.10 or newer is required.

Run `examples/governance-agent.py` with `ORVESSIAN_API_URL`, `ORVESSIAN_TOKEN`,
`ORVESSIAN_TENANT` and `ORVESSIAN_PROJECT` environment variables. Use a scoped
project credential with read/write access and an HTTPS origin (loopback HTTP is
allowed locally). Keep credentials out of source control. The example submits
synthetic metadata with fixed replay identity. Re-running does not add another
event or refresh the old heartbeat. It submits no blockchain transaction itself.

## Capture and retries

Only explicit reference, classification and timing fields are emitted. No prompts,
responses, tool arguments, documents or conversations are captured. Use opaque
references; do not put source content into references or the business-purpose
description. Metadata is not automatically anonymous or truthful.

`record_run(tool_calls=[...])` accepts up to 100 observations with only toolRef,
version, resultCode and optional boolean allowed. Unknown fields, including tool
arguments/results, are rejected before transport. Automatic framework callbacks
require the opt-in catalogue in the framework guide. Run/outcome acknowledgements
must identify the same event and accepted/duplicate status.

Persist event ID, stream, sequence and occurrence time before submission. Internal
retries preserve identical bytes. Across calls/restarts, pass the original
`occurred_at` and all original values; changing an accepted event produces a conflict.
Persist a separate increasing heartbeat sequence per deployment. Replays return
the original receipt time and cannot make a stale deployment appear fresh.

Defaults: ten-second timeout, three attempts, bounded exponential backoff.
API origin, tenant/project and transport limits are read-only public properties;
create a new client and separately scoped queue to target another project.
The framework-neutral queue also snapshots origin/tenant/project and rejects
scope changes in custom clients before enqueueing or sending each record, leaving
unsent records intact. Queue client/capacity properties are read-only and a
persistent path is required (`:memory:` is rejected). These guards prevent
accidental retargeting; they are not a sandbox against malicious customer code
or a substitute for server-side tenant authorization.
Retries cover transport failures and HTTP 408/429/500/502/503/504. Conflicts and
redirects fail immediately. Errors omit response bodies and credentials. There is
no offline queue or background thread. Callers must handle failures explicitly;
this client blocks during bounded retries. `evidence(event_id)` retrieves evidence;
it is not independent verification. Use the existing receipt/anchor verifier.

## Registry contract

- `POST /v1/agents`: agentRef, environment, deploymentRef, ownerRef, purpose,
  modelRef, configVersion, heartbeatTtlSeconds. Immutable registration per
  agent/environment/deployment; changed configuration requires a new deployment ref.
- `POST /v1/agents/heartbeat`: agentRef, environment, deploymentRef, sequence.
- `GET /v1/agents?limit=50&offset=0`: scoped directory, maximum page size 100.

POST requires write scope, uncompressed `application/json`, maximum 4 KiB.
The pilot permits 1,000 deployment registrations per project and TTL 60–86,400 seconds.
Workspace Agents is read-only and paginated. Heartbeats are shown as not observed,
fresh or stale, separately from the server's last matching event receipt time.
Refresh to update the displayed snapshot. Existing events are not auto-enrolled.

Registration model/configuration is customer-reported. Activity correlation uses
agent/environment/deployment identifiers and does not validate model configuration.
The directory does not prove fleet completeness, runtime safety or uptime.
Registry/heartbeats are operational metadata, not signed or on-chain records.
Run events follow the existing durable outbox and receipt/anchor pipeline.
Retirement, lifecycle history, mismatch detection and fleet coverage counts remain
future work; no automatic discovery or provider instrumentation is included.

## Validation and deployment

Client tests: `python -m unittest discover -s sdk/python -p test_orvessian_ingest.py`.
Governance tests: `node --test services/governance/*.test.cjs`; set
`ORVESSIAN_TEST_PYTHON` to an absolute Python executable if it is not on PATH.
The integration test uses an isolated local API, synthetic credentials and an
ephemeral signer without external blockchain submission.

SQLite initializes the registry schema during API startup. PostgreSQL requires
`003-agent-registry.sql` and updated runtime grants. The migration/RLS checks pass
on PGlite; native PostgreSQL rollout/restart validation remain deployment gates.
Back up before rollout, coordinate API/portal deployment and smoke-test tenant
isolation. An older API produces an explicit unavailable message in the Agents tab.
The current VPS soak is unchanged; reconcile it before migration or restart.

Local validation on 27 September 2026: 28 governance tests (including Python/API/
gateway/signing integration and SQLite/PostgreSQL registry isolation), four Python
client tests, website production build and 20 website tests passed. An attempted
broader Python discovery also found the pre-existing receipt tests need pytest,
which is absent from the bundled runtime; that legacy suite was not validated.

## Local package installation (28 September 2026)

`pyproject.toml` packages the base client and optional modules as
`orvessian-ingestion==0.1.0a1`. Build from the repository with
`python -m pip wheel --no-deps --no-build-isolation --wheel-dir build/sdk-packages ./sdk/python`
using setuptools 84+ and wheel 0.48+. Install the resulting local wheel with
`python -m pip install --no-deps <local-wheel-path>`. The base import has no runtime
dependencies. Extras `langchain` and `openai` declare the compatibility-tested
versions; use the existing transitive lock files for reproducible adapter testing.
No package was uploaded to PyPI. Licensing, maintainer ownership, wider Python
version matrix, support/release policy and package publication remain gates.
The built wheel was installed in an isolated local target and both base import
and optional imports were verified from the installed artifact.

The LangGraph quickstart is also verified from the installed wheel. Copy
`examples/governance-langgraph.py` into a customer test directory and run
`python governance-langgraph.py --installed-sdk --with-outcome` with the client
and queue environment variables above. `--installed-sdk` disables the repository
SDK path bootstrap and reports installed module locations/version locally for
diagnosis; those filesystem paths are not included in governance submissions.
Install the declared LangChain/LangGraph extra or pinned framework requirements
into the same Python environment before invoking the quickstart. This synthetic
workflow incurs no model-provider or blockchain cost.

Reproduce artifact acceptance from the engineering root: build the wheel, install
it with `pip install --no-deps --target <fresh-target> <wheel>`, set
`ORVESSIAN_FRAMEWORK_PYTHON` to the pinned framework Python executable and
`ORVESSIAN_WHEEL_TARGET` to the absolute installation target, then run
`node --test services/governance/framework-ingestion.integration.cjs`.
The acceptance test copies the example outside the checkout, checks the actual
module files against the installation target, executes real LangGraph/tools,
and verifies API scope, source-content exclusion, automated-label treatment,
signed receipts and batch proofs. Source and installed modes both pass without
skips when the target is configured. Without it, installed mode explicitly skips;
an ordinary source-only test is not evidence that a wheel works. This validation
uses the installed Orvessian wheel alongside already-pinned framework dependencies,
not a fresh online resolver test or a wider Python/runtime compatibility claim.
