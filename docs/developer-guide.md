# Developer guide

## Database reporting increment (27 September 2026)

Local reports and review queues no longer reject a date window simply because it
contains more than 10,000 events. `services/governance/aggregate-report.cjs`
computes scoped counts, cohorts, exact nearest-rank latency percentiles, daily
trends and linked outcome eligibility in SQL. Only aggregated rows and bounded
detail pages return to the application. SQLite uses a synchronous read transaction;
PostgreSQL uses the existing repeatable-read transaction and row security.
Late outcomes remain linked to selected runs; conflicting, automated, case-mismatched
and mixed-evaluator labels retain their existing suppression/exclusion rules.

The report query upgrade groups outcome counts/eligibility/correctness/rubrics
once per run, rather than repeating correlated lookups for each metric. KPI totals
share one selected-event scan. It adds no cache, stale-data window or migration;
the same scoped transaction and output contract apply to reports and review queues.

Output bounds remain explicit: at most 1,000 model cohorts, 10,000 distinct rubric
groups and 3,660 daily trend points; exceeding those bounds returns 422. The incident
preview contains the latest 100 records and includes `alertSummary` with total,
returned, limit and truncated fields. The portal displays the truncation notice;
KPI counts include the whole selected window. Review pages remain limited to 100
rows, with full state counts and offsets beyond 10,000. Individual investigation
history still has a 10,000-linked-record limit. Deep offset pagination, exact
percentile sorting and query scans are not constant-time operations.

PostgreSQL requires migration `005-report-indexes.sql`: stored generated lookup
columns and indexes let reporting use scoped joins under RLS without weakening
security policies. This migration can rewrite/lock the event table; schedule it
with a backup and maintenance window. Refresh statistics with owner-run
`ANALYZE governance_events` after migration or bulk import and retain autovacuum/
autoanalyze in deployment. The runtime role remains restricted. SQLite creates
its lookup indexes at store initialization. Neither change has been deployed to
the VPS by this increment.

Validation covers reference metric parity and delayed/conflicting labels, 10,155
SQLite records (10,050 runs plus 105 alerts), and 10,020 PostgreSQL-compatible
records under row security with refreshed statistics. PostgreSQL scale validation
initially used PGlite. A subsequent [native PostgreSQL mixed-load run](governance-postgres-native-validation.md)
passed with 10,620 final workspace records and concurrent authenticated dashboard
reads; the original main-report p95 was 2.645 seconds. The query upgrade reduced
it to 222 ms in a subsequent run of the same harness, with 600 successful writes
and 430 reads. Neither is a production benchmark. The shared service,
review, report and submission-harness tests and website build/tests cover this
increment. Short native concurrent dashboard reads/writes are validated; saturation,
timeouts, memory/disk growth and sustained million-record workloads remain gates.

```powershell
node --test services/governance/aggregate-report.test.cjs services/governance/governance.test.cjs services/governance/postgres.test.cjs services/governance/reviews.test.cjs scripts/governance-submission-load.test.cjs
```

## Submission capacity harness (local, 27 September 2026)

Native mixed-load extension: after starting the dedicated local PostgreSQL
cluster, run `node scripts/test-governance-postgres-native.cjs --long` for a
five-minute target workload (12,000 submissions at 40/second, four authenticated
dashboard-data readers, 10,020 pre-seeded runs). One in five submissions is a
human-adjudicated outcome; some intentionally conflict. Synthetic runs span three
model deployments and four task classes. Final metrics are compared with the
independent in-memory reference calculation. Setup and native dump/restore are
outside the timed phase. No provider requests or Base broadcasts occur.

This five-minute scenario passed in run `g1ae3d35e1e61`: 12,000 submissions and
7,373 dashboard requests with zero errors, 22,020 reconciled workspace events,
and successful native backup/restore. Submission p95 was 13 ms and main-report
p95 675 ms. See [full measurements and limitations](governance-postgres-native-validation.md).

The harness samples every five seconds: Node RSS/cumulative CPU, host free RAM,
database size, scoped pending records, connection count and pool waiting count.
It stops on Node RSS above 1 GiB, host free RAM below 512 MiB, database size above
512 MiB, scoped pending records above 30,000, monitoring failure, or a six-minute
mixed-phase deadline. Each HTTP request retains its 15-second timeout. Pending
records intentionally accumulate because no receipt/anchor worker runs here;
this test does not establish worker drain capacity. PostgreSQL process RSS/CPU,
free disk capacity and rendered browser performance are not measured. Statistics
are refreshed after seeding. Sanitized progress and final results are retained in
the new ignored `build/postgres-native/<run-id>` folder; credentials remain private.

Use `node scripts/governance-submission-load.cjs` to preview the bounded test
configuration without starting a test. Add `--run` to create an isolated local
SQLite database and a separate API child process. No OpenAI credentials, remote
endpoint, existing workspace data, signing wallet or Base broadcasts are used.
Each execution creates a new `build/submission-load-*/result.json` and database.
These synthetic artifacts are retained for inspection; no automatic deletion occurs.

```powershell
# Small functional/recovery check, not a capacity certification:
node scripts/governance-submission-load.cjs --run --count 200 --rate 50 --concurrency 5 --faults --batch-sample 20
# Harness regression tests:
node --test scripts/governance-submission-load.test.cjs
# Preview a later volume run (add --run when ready):
node scripts/governance-submission-load.cjs --count 20000 --rate 120 --concurrency 20 --seconds 300 --batch-sample 100
```

Controls: `--count` unique submissions (default 200, maximum 1,000,000), `--rate`
target new submissions/second (20; maximum 10,000), `--concurrency` concurrent
submission tasks (5; maximum 100), `--seconds` submission deadline (60; maximum
86,400), `--batch-sample` local signed receipt sample (20; 0 disables; maximum
1,000), and `--faults` deterministic first-attempt failures. These are harness
bounds, not demonstrated service capacity. Retries add attempts above the target
new-submission rate, with at most three attempts per event, short exponential
backoff and jitter. Each HTTP attempt has a five-second timeout; in-flight work
and post-run reconciliation may finish after the submission deadline.

Fault mode inserts 429 and 503 responses before acceptance and 503 responses
after committing an event, modelling an uncertain acknowledgement. The client
retries the exact same ID and payload. After load, the service stops cleanly and
reopens the same database, then replays up to 20 acknowledged events. This tests
idempotency and clean restart durability, not abrupt power loss, network socket
failure, SDK queue recovery or the production worker's restart behaviour.

Results include actual acknowledged throughput; request and end-to-end submission
p50/p95/p99 latency; HTTP status counts; retries; failures; stored/outbox counts;
missing acknowledged records; records stored without a client acknowledgement;
restart replay results; one report probe; and optional receipt signature,
commitment and membership verification. `passed` covers complete ingestion,
reconciliation, replay and sampled evidence only. Inspect `reportProbe` separately:
reports now aggregate in the database beyond 10,000 records; 422 indicates a
cohort/rubric/trend output bound, not a raw-event limit. Successful
ingestion does not establish portal scalability. Report latency is measured
after load, not concurrently, and batch timing includes signing and verification.

The small local recovery check on 27 September stored all 200 unique records:
184 accepted acknowledgements and 16 duplicate acknowledgements after injected
post-commit failures; 57 retries, zero missing records, 20 successful restart
replays and 20/20 verified sample receipts. Achieved 48.89 acknowledgements/sec
over 4.091 seconds at target 50/sec. This is a functional check on a developer
machine, not a production benchmark. Regression tests cover fault recovery,
deadline exhaustion and option bounds.

When ready, measure sustained stages around 12, 50 and 120 submissions/sec,
then bursts and a 24-hour isolated test. One million/day averages 11.57/sec;
ten million/day averages 115.74/sec. Rate and count must be chosen together;
the current harness's one-million-record cap intentionally cannot run ten
million submissions in a single test. Extend it with streaming metrics,
checkpoints and resource/backlog stop conditions before a long VPS run.
VPS/production-like testing also needs a dedicated test database and credentials,
backup/restore validation, concurrent dashboard probes, resource monitoring,
native PostgreSQL query/load validation, and explicit
worker drain/fee budgets. No large-volume or VPS run is scheduled by this change.
Provider-capacity testing is out of scope by product decision; test our submission
path with synthetic structured metadata and keep customer source content outside
the platform.

The [review workflow reference](authenticated-customer-workspaces.md) covers the
new local review queue, immutable assessments, explicit reviewer permission and
synthetic preview launcher `scripts/run-review-workspace-local.cjs`.

For the first real framework integration, see the
[LangChain/LangGraph adapter guide](../sdk/python/README-langchain.md) and
`examples/governance-langgraph.py`. It uses optional pinned dependencies and a
bounded local queue, with no inference provider credentials needed for its example.

Reviewed 27 September 2026. Start here for the governance product; use the linked specifications for exact interfaces.

## Repository boundaries

The first agent-registry/Python ingestion slice is available locally. Start with
the [client reference and synthetic example](../sdk/python/README-ingestion.md).
It connects registration, heartbeat and run metadata to the scoped API and workspace;
it has not been rolled out to the running VPS soak. Registry metadata is separate
from the signed run-event evidence pipeline.

- Engineering: this repository, including services, SDKs, contracts, schemas, tests and deployments.
- Website: separate repository at C:/AIChain/website; local edits do not publish it.
- Business and website planning: the project hub links back to these seven guides.
- Historic node/miner code remains research; no own-chain setup is required for the Base application.

## Build a customer integration

1. Read the [architecture](platform-architecture.md) and [API reference](../services/governance/README.md). Use synthetic data until production readiness gates pass.
2. Submit versioned structured JSON, at most 64 KiB. Keep conversations, documents, media and sensor streams in customer systems. Use opaque source references, model/configuration versions and explicit outcome labels.
3. Use scoped ingestion credentials. Retry with the same event ID and payload; conflicting retries are rejected. Acceptance atomically persists the event and outbox.
4. Inspect the authenticated workspace through the same-origin server gateway. Never put API tokens or signing keys in browser storage.
5. Retrieve a record-specific evidence export and verify each check independently; a report row alone is not a verified Base anchor.

## Reference and validation

- [SDK and integration plan](sdk-integration-plan.md): supported-client work, prioritised provider/framework/telemetry adapters, workflow connectors and acceptance criteria. All named adapters remain planned; the private prototype is not a published package.

- [Governance schema](../spec/governance/governance-event-v0.1.0-draft.schema.json) and [metric catalog](../spec/governance/metric-catalog-v0.1.0-draft.json).
- [General receipt SDK and local example](verification-receipt-developer-guide.md): run npm ci then node examples/verification-receipt.js from the engineering root. This example is offline and uses synthetic data.
- [Authenticated workspace implementation](authenticated-customer-workspaces.md).
- [Record, receipt and Base verification](governance-receipt-base-integration.md).
- [Worker configuration and recovery model](governance-automated-worker.md).
- [Storage, migrations and environment binding](governance-storage-and-environments.md).
- [Website setup and route tests](../website/README.md).

Use the test scripts in each component's package and README; validate tenant isolation, idempotency and independent evidence verification when changing those paths. Keep fixture measurements synthetic and expose metric denominators. Do not start a second publisher using the migrated VPS wallet; see the [operations runbook](operations-runbook.md).

## Documentation changes

Change the relevant one of the seven guides when behavior, delivery decisions or claims change. Put exact schemas in spec/, rationale in docs/decisions/, and dated validation results in docs/validation/. Update a supporting reference when its interface or procedure changes. Archive completed planning instead of creating another competing current-status document.
