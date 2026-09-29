# Automated governance batching and relay — local testnet pilot

> Current baseline — 27 September 2026: [Platform current state](platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

Status: implemented, tested and live testnet acceptance completed on 2026-09-27. The previously submitted 182-record
Northstar batch remains confirmed under Fluxora. A separate automated acceptance
record (`worker-acceptance-001`) has been signed and batched for a new dedicated
gas wallet, and the live preflight correctly stops at `needs-funding`.
The initial preparation stage below preceded live submission. The worker is now active on the VPS; see the current baseline and VPS runbook.

## Customer flow

An accepted structured event enters the existing outbox. The worker finds unsigned
records in one explicitly configured tenant/project, signs their exact accepted
JSON with the recording key and batches up to 1,000 receipts. A five-second polling
loop flushes available records; this is a maximum batch size, not 1,000 per second.
The independent publisher wallet pays Base Sepolia gas. Customers need no wallet.
The existing authenticated evidence panel shows the resulting batch/transaction
and recomputes its live verification status. New KPI cards are a separate increment.

## Durability and recovery

The event/evidence store supports SQLite and PostgreSQL. The worker has a separate
local SQLite journal with WAL and synchronous FULL, binding its tenant/project,
chain, contract, recorder and publisher. Preserve the journal alongside evidence
backups: it contains signed transactions, nonce allocations and spend reservations.
Never rebuild or delete a journal to clear an uncertain submission.

The worker discovers evidence committed before a crash even when no journal job
was written. Before sending a transaction it persists the exact signed bytes,
transaction hash, nonce and conservative fee reservation. Network timeouts become
`broadcast-uncertain`. Retries resend the SAME bytes and hash with exponential
backoff (up to five minutes); they do not allocate another nonce. It will not start
another transaction while an earlier one is unconfirmed, unavailable or reorged.
After successful verification it attaches the transaction to all batch members.
Rechecking confirmed jobs detects later loss of canonical inclusion.

A single process owns the journal through an exclusive `.lock` file; ticks within
the process are serialized. Graceful shutdown closes the journal and removes the
lock. After an abrupt crash, inspect the PID in the lock and prove the owner has
stopped before removing ONLY the lock and restarting with the same journal. A
lock is never stolen merely because it is old. Use one dedicated wallet, one
journal and one worker instance; multi-host failover is not supported in this pilot.
Do not use the wallet manually or in another worker. Unexpected external pending
transactions stop nonce allocation. Lost journals or consumed/conflicting nonces
require operator investigation; no automatic replacement or cancellation exists.

## Policy and security

Only demo/test events and the pinned Base Sepolia chain/contract runtime are
accepted. Before signing, every record commitment, trusted recorder signature,
batch proof and complete batch count are checked. Returned signed transaction
fields are checked again before persisting or sending. Existing batches assigned
to another publisher (including Fluxora) are never taken over.

Default limits: 1,000 receipts, 10 newly signed transactions per rolling hour,
0.1 gwei maximum fee-per-gas and 0.001 test ETH reservation budget per rolling
24 hours. Reservations survive restarts and uncertain broadcasts. Each includes
20% execution-gas headroom and a configured L1-data allowance. The allowance is a
conservative planning reserve, **not a protocol-enforced cap on Base L1 fees**.
Keep the gas wallet balance limited. Production needs measured total-fee accounting.

Paused mode still reconciles existing transactions but does not prepare, sign or
rebroadcast new work. No secrets are served over HTTP or written to console logs.

Every broadcast, including a retry of previously signed work, now revalidates
the stored signature/hash/nonce/contract/batch binding and the current fee and
batch limits. The saved reservation must cover execution liability from the
actual bytes plus the current L1 allowance. Missing/understated reservations,
future signing times or malformed recent accounting stop the retry for review.
Rolling-hour/day ceilings apply before replay too; an old signed job retains
its own spending liability even when its signing time falls outside the rolling
day window. This does not authenticate historical signing timestamps, account
for every actual Base fee or enumerate external wallet activity.

Policy conflicts return the existing fee/rate/budget state or
`batch-policy-review-required` / `reservation-review-required`; malformed signed
identity or batch binding throws a journal-review error. A refusal preserves
the original bytes, hash, nonce and reservation. Reconciliation metadata may
still update during the preceding read-only chain check. No refusal allocates a
replacement nonce, changes signed fees, tops up reservations or clears the job.
An operator must investigate and explicitly choose a compatible reviewed
policy/disposition; the worker never silently rewrites an old transaction to
satisfy new limits.

PostgreSQL publisher authorization is checked at tick entry and immediately
before broadcast. A restored `customer-active` gate permits customer access but
refuses publisher startup, worker-profile store transactions and these sends.
Withdrawal during signing preserves the signed journal without broadcasting;
the check does not lock an external network send atomically. Restored SQLite
journals retain their independent recovery gates.

Validation on 29 September: `npm run test:governance-recovery-worker` passes 15
tests. The retry case creates an actual worker-signed uncertain transaction,
checks policy/reservation/timestamp/nonce refusals with zero additional mock
sends, then verifies that compatible state retries the exact original bytes.
Another case withdraws publisher access during signing, verifies zero sends and
unchanged signed state on a denied next tick, then permits exact-byte replay
after authorization is restored. Existing restart, reorg, outage, spend and
nonce-review tests remain green.
No live worker, wallet or service was changed by this local acceptance.

The API retains only public recorder trust configuration. The local key files are
ignored by Git; production custody requires a managed signer, access controls and
rotation. Signed transaction bytes in the journal must also be protected.

## Running

`npm run governance:worker-local -- --once` provisions/reuses the ignored local
gas key and performs one PAUSED check against the existing Northstar workspace.
The local launcher uses the existing recording key; it does not rotate that key.
Public wallet information is in `build/workspace-local/relayer-public.json`.

Set `GOVERNANCE_WORKER_ENABLED=true` to enable testnet signing/broadcasting. Run
without `--once` for the five-second loop; stop cleanly with Ctrl+C/SIGTERM. The
current live acceptance checks were bounded single runs; no background worker has
been left broadcasting while awaiting funding.

For explicit deployments use `npm run governance:worker` with:

- `GOVERNANCE_ENV`: dev or test (production rejected).
- `GOVERNANCE_TENANT`, `GOVERNANCE_PROJECT`: exactly one authorized scope.
- `GOVERNANCE_DB`, or `GOVERNANCE_STORAGE=postgres` and `GOVERNANCE_DATABASE_URL`.
- `GOVERNANCE_RECEIPT_KEY_FILE`: recording key; `GOVERNANCE_RELAYER_KEY_FILE`: distinct publisher key.
- `GOVERNANCE_WORKER_JOURNAL`: durable local path dedicated to that wallet/scope.
- `GOVERNANCE_EVIDENCE_RPC_URL`: HTTPS Base Sepolia endpoint.
- `GOVERNANCE_WORKER_POLICY`: optional JSON limits; enabled flag controls pause.

No new PostgreSQL migration is required beyond evidence migration 002. Batch
discovery remains scoped and protected by the existing RLS policy.

## Validation and next acceptance gate

Four worker tests exercise uncertain broadcast/restart, identical-byte retries,
evidence/journal crash recovery, simultaneous ticks and exclusive ownership,
confirmation, post-confirmation reorg, RPC outage, pause, network, gas budget and
funding controls. Together with receipt and PostgreSQL tests, 14 checks passed.
Chain fault tests use simulated providers; the new automated batch is not yet
live-chain validated. Live read-only preflight verified the pinned chain/code and
prepared the new record, then returned needs-funding before signing/broadcasting.

Historical funding instruction (completed; do not repeat for this acceptance run): the dedicated Base Sepolia publisher is
`0x8c1dE1e5fcB71928bB832aF1D50B5F54dE90109c` (0.001 test ETH is enough for this
small acceptance run). Then run the worker, inspect its confirming/confirmed
status, independently verify the exported receipt and inspect the portal.
Follow with supervised VPS deployment, bounded outage/restart testing and the
24-hour load test. This single-in-flight implementation prioritizes recovery
correctness; it is not the final millions-of-records/day throughput architecture.
Confirmed-job rescans and serial batch verification also need bounded indexing
before sustained high-volume deployment.

## Funded live acceptance completed — 2026-09-27

The dedicated wallet was funded and the worker automatically submitted worker-acceptance-001 in transaction `0xe55e4d707b314f27334ce79bc35a5c05a7c9914b271b1592542ee0b9122fc30d`, Base Sepolia block 47373193. Separate worker process runs recovered the journal, progressed through confirming to confirmed, then returned idle. The journal records nonce 0 and exactly one broadcast attempt. The authenticated API and independent export verifier both passed at 57 L2 confirmations. See [validation result](validation/governance-worker-live-2026-09-27.json).

This supersedes the funding-pending status above. Runs were bounded acceptance invocations; no continuous worker or VPS deployment was left running. Next gate: supervised persistent deployment and longer outage/load testing.

## Supervised VPS acceptance passed — 2026-09-27

The approved migration is complete. aichain-governance-worker is active and enabled at boot on 62.171.161.32; the local gas-wallet launcher is disabled. Graceful restart and a forced SIGKILL both recovered safely. A simulated RPC outage retained ten pending synthetic records without broadcasting; restoring RPC automatically prepared and submitted one ten-record batch. Transaction 0x53f57a7dec72b734bd59fd82bb4072ca9f2b48f421d719864549a0afcb842473 confirmed in block 47373519 with 25 L2 confirmations at the saved check. The journal records nonce 1 and one broadcast attempt for this new batch; no duplicates and no pending records remain. Existing ingress/indexer stayed active. The worker used approximately 34 MiB RAM at final check.

See [saved validation](validation/governance-vps-worker-2026-09-27.json). The service remains running with the existing fee/rate caps. No 24-hour load generator was started. The local portal still reads its local database; the VPS acceptance records require a deliberate backend cutover to appear there.

## VPS portal cutover and soak started — 2026-09-27

The local portal now reads the authoritative VPS API through a loopback SSH tunnel. Both workspace logins and tenant isolation passed; the browser displays a VPS-created record with Base confirmation. A bounded 24-hour API soak is running at 100 synthetic records/hour (2,400 maximum), with error/backlog stops and existing gas limits. The first 100 were accepted with zero errors. This is sustained reliability testing, not maximum-throughput testing. Completion remains pending. See [portal and soak runbook](governance-vps-portal-and-soak.md).
