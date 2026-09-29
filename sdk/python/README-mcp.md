# MCP tool observation — local alpha

28 September 2026. Tested with official Python **mcp 2.2.0**,
**langchain-core 1.6.5**, Python **3.12.14** in an isolated environment. This
customer-side call wrapper attaches tool metadata to an existing agent-root
record, complementing framework callbacks. It is not an MCP server, tool gateway,
permission manager or automatic MCP discovery service.

Use the local wheel's `[mcp]` extra or `requirements-mcp.txt`. Keep the MCP test
environment separate from the provider/telemetry acceptance environment; their
optional SDK dependencies are not implicitly installed in the base package.

```python
from orvessian_mcp import GovernanceMcpClient

# Existing connected MCP Client, active GovernanceCallback and caller-owned payload.
monitored = GovernanceMcpClient(mcp_client, handler, tool_catalog={
    'lookup': {'toolRef':'legal-server.lookup', 'version':'v1'}})
result = await monitored.call_tool('lookup', customer_arguments)
# The original result remains in the customer application.
print(monitored.metrics)
```

Invoke inside the root workflow monitored by `handler` and await the tool before
that root completes. The synthetic `examples/governance-mcp.py` demonstrates this
with a real RunnableLambda root and an in-process MCP server. The wrapper does not
invent another model run for each tool call; the root event contains the bounded
`activity.toolCalls` observations used by the portal.

For explicit local process-transport acceptance, run the example with
`--stdio-test`. The caller-owned MCP SDK launches the synthetic
`examples/mcp-synthetic-server.py` fixture using the same Python executable,
with stdio reserved for protocol messages and a five-second read timeout. The
example has a 20-second overall deadline. This option launches only that fixed
local fixture, not an arbitrary customer command. It does not add subprocess
launching to `GovernanceMcpClient`; customer production connections remain
configured by the customer. The fixture rejects inherited governance credentials;
the SDK's default limited environment excludes the parent API token.

## Mapping and privacy

The customer configures a fixed catalogue of up to 100 tool names, each mapped to
an opaque toolRef/version. Prefix toolRef with a meaningful customer-controlled
server identity to distinguish identical tool names on different servers. Neither
MCP's server name nor tool annotations establish trusted identity/permission.
The configured version is a customer assertion, not a server attestation.

Arguments and kwargs are forwarded without inspecting, serializing, storing or
logging them. Results return unchanged to the caller. The wrapper reads only the
protocol error boolean to map completed/failed status; it never reads content,
structured_content, error descriptions, annotations, schemas or raw metadata.
No `allowed` value is inferred. Completed means the call returned a non-error
result, not that its business output is accurate, the call was authorized or a
side effect was safe.

Tool names absent from the catalogue still follow the customer's original call
but are not recorded; `skipped_unmapped` increases. Observation failure, inactive
root or the shared 100-tool bound increments capture_failed; the wrapper does not
change the customer's execution/approval policy. Root closure during a call can
leave its persisted outcome pending. Cancellation records interrupted and re-raises
the original cancellation; protocol/transport exceptions record failed and
re-raise unchanged. A failed or cancelled client request does not prove the remote
side effect did not occur. Nonterminal/unrecognised result shapes stay pending;
the wrapper does not process elicitation or grant extra input/approval itself.

Metrics calls, skipped_unmapped, capture_failed and pending are local counters,
not durable complete-coverage measurements. The original handler's capture_status
and tool_capture_status remain relevant. Once the root closes, its selected
metadata enters the existing durable queue and explicit API delivery/receipt path.
A crash before root completion can lose observations; no independent per-tool
durable event, timestamp, retry identity or completeness guarantee is implemented.

## Compatibility and security boundary

The wrapper takes an already connected client and does not open URLs, launch
subprocesses, create credentials, expose tools, retry calls or discover new tools.
Connection authentication, transport security, approvals, sandboxing, side effects
and request limits remain in the customer's MCP application. Delegated kwargs are
passed to the client's own API, preserving its behaviour. Do not apply automatic
call retries to tools with side effects merely to retry governance delivery.

MCP v2 high-level Client may handle its own multi-round-trip input-required flow;
this wrapper records the eventual result, not each approval/input round. Low-level
nonterminal results are left pending. MCP v1, arbitrary vendor transports, cloud
MCP servers and full approval/elicitation tracing remain unverified.

## Validation

Four tests pass in the isolated MCP environment: actual SDK direct and legacy
in-memory modes with private arguments/results, tool error status, a real agent
root, unknown/nonterminal/cancelled calls, inactive root and capture overflow;
actual stdio process transport verifies a distinct server PID, original private
results, error status, metadata exclusion, absent inherited API token and orderly
server exit. Two example integration cases (in-memory and stdio) reach an isolated
tenant API and independently checked signed receipt/batch proof while keeping
model-run count at one. No external MCP
tool, model provider, notification or Base transaction was invoked.

```text
python -m unittest discover -s sdk/python -p test_orvessian_mcp.py
# Set ORVESSIAN_MCP_PYTHON to that environment, then:
node --test services/governance/mcp-ingestion.integration.cjs
```

The existing framework/provider/telemetry environment passes its 27 tests and
explicitly skips MCP tests when that optional dependency is absent. This is not
equivalent to testing a missing SDK. Before release: broader runtime/version
matrix, real customer transport, overhead/concurrency measurements, stable SDK
licence/support ownership and independent per-tool/approval event semantics.

Primary references checked 28 September 2026:
[official Python SDK](https://github.com/modelcontextprotocol/python-sdk),
[MCP tools specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools).
