# KawPoW GPU Deployment Hardening

Version: 0.1.0-draft · Updated: 2026-09-14 · Status: development-only

## Purpose

This is the operational baseline for disposable KawPoW GPU trials. It records
failures observed during the first cross-region three-miner rehearsal and the
guardrails now included in the deployment template. It is not a public-mining
or production runbook.

## Required deployment controls

- Run the GPU bootstrap as root on an ephemeral host. It installs Go and build
  prerequisites, initializes only build-required submodules, and pins the
  external miner source revision.
- Keep node RPC, the mining adapter, and relay listeners on loopback. Use
  authenticated, source-restricted temporary SSH relays for cross-host P2P.
- Record the genesis digest, Core-Geth build revision, miner SHA-256, GPU
  model, driver version, and compute capability in private run evidence.
- Start the adapter with `--work-status-file /absolute/run/current-work.json`.
  The file contains only work metadata; it contains no wallet material.
- Start the supervisor with the same default status path. It restarts the
  legacy miner before a published template expires. If no status file is
  available, it enforces a 45-second maximum job duration as a safe fallback.
- The supervisor pauses a GPU at 80°C by default. Set
  `AICHAIN_MAX_GPU_TEMP_C=0` only for an explicitly supervised diagnostic.
- The supervisor records `head-stalled` and reconnects the miner if the
  canonical head has not advanced for 120 seconds by default. This is a local
  recovery attempt, not a node restart or a consensus intervention. Override
  only with `AICHAIN_MAX_HEAD_STALL_SECONDS` for a measured diagnostic.
- The adapter suppresses an exact repeat of a `(workId, nonce, mixDigest)`
  submission locally. Repeated legacy-miner retries therefore cannot flood
  the node with an already-submitted solution.
- Treat `accepted: true` from `aichain_submitKawpowWork` as a reported node
  acceptance, not proof of final canonical inclusion. Reconcile the audit log
  after a run from the mining node's loopback RPC:

```bash
python3 scripts/reconcile-kawpow-submissions.py \
  /absolute/run/kawpow-submissions.jsonl \
  /absolute/evidence/submission-reconciliation.json \
  --node-rpc http://127.0.0.1:8545
```

  The report labels each reported block `canonical`, `orphaned`, `not-found`,
  or `unavailable` by comparing its hash to the canonical block at its height.

## Fleet preflight

Use a private copy of `fixtures/phase4/gpu-fleet.example.json` as the inventory.
It contains host addresses and an SSH identity path, so it is deliberately not
part of the public run evidence. Validate and collect the manifest with:

```bash
python3 scripts/validate-kawpow-gpu-fleet.py /absolute/gpu-fleet.json
bash scripts/preflight-kawpow-gpu-fleet.sh \
  /absolute/gpu-fleet.json /absolute/evidence/preflight
```

The preflight is read-only: it verifies SSH reachability, GPU model/compute
capability and build prerequisites, then writes a public-safe manifest without
host addresses or identity paths. Starting/stopping disposable nodes remains a
separate explicitly approved action.

## Failure modes observed and remediation

| Observation | Cause | Template control |
| --- | --- | --- |
| First-host build lacked `go` | GPU image did not include the Go toolchain | Bootstrap checks and installs Go. |
| Bootstrap fetched excessive Core-Geth fixtures | Recursive test submodules were unnecessary | Bootstrap initializes only Core-Geth and cpp-kawpow build dependencies. |
| Quotes/newlines broke ad-hoc relay authorization | Remote shell quoting and SSH key-file formatting | Treat relays as a dedicated, reviewed deployment step; do not hand-compose key entries during a run. |
| Templates became stale while GPUs still hashed | Legacy pool miner retained a job after its expiry | Status-aware refresh plus bounded max-job restart. |
| Identical shares were submitted repeatedly | Legacy miner retried a reported solution | Bounded adapter-side exact-submission deduplication. |
| Node reported a solution accepted but chain stopped advancing | Acceptance did not itself establish canonical import or continued head progress | Canonical reconciliation plus a 120-second head-stall event and miner reconnect. |
| One remote GPU reached 84°C | Provider hardware/power profile differed | Default thermal pause and host-specific temperature evidence. |

## Exit criteria for a usable soak run

- No sustained `expired-adapter-work` or `stale` burst after the refresh guard
  is enabled.
- All miner and validator heads converge after each block and after a restart.
- CPU validation, propagation, block intervals, stale rate, and GPU
  temperatures are captured in the evidence report.
- Every reported accepted block has a reconciliation result; no unexplained
  `not-found` result or sustained `head-stalled` event remains.
- Temporary relay keys and tunnels are removed when the disposable network is
  shut down.

## Open work

- Make template expiry part of the native mining protocol/long-poll response,
  rather than a legacy-miner supervisor fallback.
- Add a dedicated, audited relay orchestration command so manual SSH key file
  editing is no longer needed for multi-region trials.
- Validate the same guardrails with AMD/OpenCL hardware before closed-testnet
  sign-off.
