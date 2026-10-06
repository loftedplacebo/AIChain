# Stage C bounded two-project capacity smoke

The [runner](../scripts/pilot_stage_c_capacity_smoke.py) submits fixed,
content-free synthetic run metadata through the Python SDK. Run one process
per project with that project's protected write-only credential. It does not
call a model, read source content, sign receipts or broadcast transactions.
The hosted evidence workers perform signing and Base Sepolia submission.

Each process is capped at ten distinct events, at intervals of at least one
minute. The run ID, event sequence, timestamp and accepted count are saved in
an owner-only state file. A restart reuses a pending event ID and timestamp.
New runs bind the state file to its tenant, project, run ID, count and interval;
changing any of these values fails closed. The active `20261006-a` run started
with the earlier state format, so keep its deployed script in place until both
units finish. Use a new state file for a later run with the scope-bound format.
The current trial uses ten events per project, six minutes apart, with both
project processes active at the same time. The project's normal write, storage,
worker gas and evidence-backlog limits remain in force.

Before a run, check both public relayer balances, protected project-key expiry,
current hosted health and the two worker units. Use different state paths for
the two projects. Stop the transient load units to pause the test; keep their
state files for safe replay. Logs print event IDs, project references and
counts, never credentials. The accepted `stagec-<run-id>-<sequence>` IDs can
be checked through scoped database reads and independent signed evidence/Base
Sepolia verification with the [read-only verifier](../scripts/verify_stage_c_capacity_smoke.cjs).
On the VPS, run it with the protected API environment and
`PILOT_API_ROOT=/opt/aichain/governance-pilot-api`; it reads the protected
worker registry to select each project's trusted signer. It checks each
event's signature, record commitment, batch membership and confirmed chain
transaction, and reports receipt-to-signing and receipt-to-mined time.
The public RPC can be temporarily unavailable; the verifier retries that
read-only query three times and reports chain state separately from signature
and proof validity. A single `incomplete` observation is not evidence of a
failed receipt.

The pilot acceptance record should include: accepted/duplicate/rejected count
per project, first and last acceptance times, time to confirmed evidence,
maximum unresolved backlog and attempts, any 429/5xx responses, worker memory,
host free memory/disk, relayer balance change, and final backup/restore health.
The two-project run is a conservative synthetic smoke test, not a sustained
throughput claim or a production service limit. The owner must approve an
explicit supported project count, volume and evidence-delay target before
Stage C sign-off.

## Proposed supervised Stage C envelope for owner review

Subject to the full run and alert drill passing, support at most two active
synthetic projects at once, with at most ten new receipts per project per hour
in a prearranged test window. Require each accepted receipt to reach confirmed,
independently verifiable Base Sepolia evidence within 30 minutes; the hosted
health checker treats older unresolved work as a failure. If a project exceeds
that delay, pause its trial and reconcile its durable receipt and worker job
before resuming. Michael Grant is the primary alert and support owner, reached
through the current Codex chat; each partner trial still needs its own support
window, escalation contact and alternate operator. Daily B2 capture and the
documented pause and restore procedure remain part of the supervised service.
This is a proposed pilot operating limit for owner approval, not an automatic
quota or production availability commitment.

On 6 October 2026, transient units `orvessian-stage-c-load-operator.service`
and `orvessian-stage-c-load-internal.service` started the bounded run with
ID `20261006-a`. Each accepted event `stagec-20261006-a-00` in its separate
project. The first event in each project passed independent signed/Base
Sepolia verification. Receipt-to-mined time was 27 seconds for the operator
project and 12 seconds for the internal project. Completion and full-run
latency are pending; see the
[rollout record](deployments/stage-c-vps-rollout-2026-10-06.md) for the
pre-run backup, restore and health evidence.
