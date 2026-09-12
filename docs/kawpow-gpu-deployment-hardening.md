# KawPoW GPU Deployment Hardening

Version: 0.1.0-draft · Updated: 2026-09-12 · Status: development-only

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
| One remote GPU reached 84°C | Provider hardware/power profile differed | Default thermal pause and host-specific temperature evidence. |

## Exit criteria for a usable soak run

- No sustained `expired-adapter-work` or `stale` burst after the refresh guard
  is enabled.
- All miner and validator heads converge after each block and after a restart.
- CPU validation, propagation, block intervals, stale rate, and GPU
  temperatures are captured in the evidence report.
- Temporary relay keys and tunnels are removed when the disposable network is
  shut down.

## Open work

- Make template expiry part of the native mining protocol/long-poll response,
  rather than a legacy-miner supervisor fallback.
- Add a dedicated, audited relay orchestration command so manual SSH key file
  editing is no longer needed for multi-region trials.
- Validate the same guardrails with AMD/OpenCL hardware before closed-testnet
  sign-off.
