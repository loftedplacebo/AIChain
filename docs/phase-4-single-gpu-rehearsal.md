# Phase 4 — Single-GPU / dual-validator rehearsal

Version: 0.1.0-draft · Updated: 2026-09-08 · Status: ready when GPU SSH identity is verified

## Purpose

This is an **interim** Phase 4 rehearsal for the hardware available now:

```text
One NVIDIA GPU miner ── private P2P ── VPS CPU-only validator
                         private P2P ── Laptop CPU-only validator
```

It validates independent CPU acceptance, synchronization, recovery, AVR/proof
traffic and the new monitoring pipeline across three roles. It cannot test
miner competition, natural multi-miner stale rate, adversarial greater-work
reorganisation, AMD/OpenCL compatibility, or the full three-miner/two-region
closed-testnet gate. Those remain open.

## Safe entry conditions

- Every process uses a fresh disposable KawPoW/ASERT genesis and datadir.
- GPU miner, VPS validator and laptop validator use the same reviewed binary,
  genesis digest and explicit `--aichain.kawpowdev.asert-target 10` profile.
- Node RPC and AI mining RPC remain loopback-only. P2P is private and
  allow-listed/authenticated.
- Validators do not run mining software or receive mining keys.
- The existing Ethash devnet and the live governance-delay trial are not used.
- The GPU SSH host identity has been verified against the provider’s displayed
  fingerprint before accepting a new host key. Do not use `accept-new` blindly.

## Rehearsal sequence

1. Create and record a release manifest using the closed-testnet template, but
   mark the run as `single-gpu-rehearsal` in its non-secret evidence record.
2. Start the two validators, verify matching genesis/build identities and make
   each explicitly peer with the GPU mining node.
3. Mine and observe 100 blocks. Collect independent canonical-head snapshots,
   block timing and CPU verification metrics.
4. Submit bounded AVR traffic: individual anchors, batches of 10 and 100, and
   one real-proof replay. Record queue, inclusion, proof and indexer metrics.
5. Stop one validator cleanly, let the GPU miner advance at least 100 blocks,
   restart the validator from the same datadir and measure catch-up/indexer
   recovery. Repeat for the other validator.
6. Run a two-hour soak with the monitoring collector and alert evaluator.
   Preserve alerts and public-safe aggregate files even on failure.
7. Generate an acceptance report. It must be labelled **interim**, because the
   full policy’s multi-miner and 24-hour requirements will be incomplete.

## Commands and evidence

Use the existing role-aware scripts for the disposable KawPoW/ASERT profile:

```bash
# Start each role only with explicit development activation and fresh datadirs.
bash scripts/start-kawpow-asert-node.sh

# Observe independent miner/validator block heads.
python3 scripts/observe-kawpow-g3-network.py --blocks 100 --output evidence/network-observation.json

# Collect a local role snapshot and evaluate identities/head/peer alerts.
python3 scripts/collect-phase4-metrics.py --help
python3 scripts/evaluate-phase4-alerts.py --help
```

The exact host-specific start commands, P2P relay addresses and key paths are
intentionally not committed. They belong in the private run record, not source
control. Follow the [private metrics pipeline](./phase-4-private-metrics-pipeline.md)
and [fault harness](./phase-4-measurement-and-fault-harness.md) for safe output
handling.

## Interim exit record

The report should state all of the following explicitly:

- one NVIDIA GPU miner only;
- two CPU-only validators and their independent canonical-head agreement;
- runtime, observed blocks and whether the two-hour soak completed;
- AVR/proof/batch and indexer metrics;
- validator restart/catch-up result;
- all alerts, including resolved warnings; and
- deferred gates: AMD, at least two further independent miners, two-region
  competition, natural stale rate, greater-work reorg and 24-hour soak.

No result from this rehearsal is a closed-testnet exit, a public testnet claim,
an ASIC-resistance claim, quantum-resistance proof or mainnet launch approval.
