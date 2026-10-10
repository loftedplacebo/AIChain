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
changing any of these values fails closed. The completed `20261006-a` run used
the earlier state format; use a new state file for a later run with the
scope-bound format. That trial used ten events per project, six minutes apart,
with both project processes active at the same time. The project's normal
write, storage, worker gas and evidence-backlog limits remain in force.

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

For a later all-project synthetic wave, run the same bounded SDK runner once
per registered project with a distinct protected state file, identical run ID
and count. The verifier accepts `RUN_ID COUNT all` to read every registered
project from the protected worker registry and fails if any worker is paused.
The original two-project invocation remains the default. Stay within the
approved eight-new-receipts-per-project rolling-hour limit; a new verifier
mode does not increase that operating limit.

The pilot acceptance record should include: accepted/duplicate/rejected count
per project, first and last acceptance times, time to confirmed evidence,
maximum unresolved backlog and attempts, any 429/5xx responses, worker memory,
host free memory/disk, relayer balance change, and final backup/restore health.
The two-project run is a conservative synthetic smoke test, not a sustained
throughput claim or a production service limit. The owner approved the
supported project count, volume and evidence-delay target below on
6 October 2026.

## Approved supervised Stage C envelope

Michael Grant approved in this chat on 6 October 2026: support at most two active
synthetic projects at once, with at most eight new receipts per project in any
rolling 60-minute window during a prearranged test. Reserve the remaining two
of the worker's ten hourly transaction slots for the operator watcher and
recovery margin. Count every separately published batch against this limit;
pause new submissions if other publication work consumes the margin. Require
each accepted receipt to reach confirmed,
independently verifiable Base Sepolia evidence within 30 minutes; the hosted
health checker treats older unresolved work as a failure. If a project exceeds
that delay, pause its trial and reconcile its durable receipt and worker job
before resuming. Michael Grant is the primary alert and support owner, reached
through the current Codex chat; each partner trial still needs its own support
window, escalation contact and alternate operator. Daily B2 capture and the
documented pause and restore procedure remain part of the supervised service.
This is the approved pilot operating limit, not an automatic
quota or production availability commitment.

On 6 October 2026, transient units `orvessian-stage-c-load-operator.service`
and `orvessian-stage-c-load-internal.service` completed run `20261006-a`:
ten accepted events each, six minutes apart, with no rejected submission and
successful unit exits. Independent verification found all 20 valid recording
signatures, record commitments, batch proofs and confirmed Base Sepolia
transactions. The internal project's maximum receipt-to-mined time was 31
seconds. Nine operator events took at most 52 seconds; the tenth took 380
seconds because the normal watcher used an hourly signing slot and the
worker's ten-transaction rolling-hour cap queued the final load event. The
queue cleared without intervention, but repeating ten test receipts per hour
alongside watcher traffic would exceed the policy. The approved eight-receipt
envelope is a conservative operating inference from this result, not a
sustained-load measurement. See the
[rollout record](deployments/stage-c-vps-rollout-2026-10-06.md) for the
backup, restore, load and health evidence.
