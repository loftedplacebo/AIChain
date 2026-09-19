# Phase 4 — Single-GPU / dual-validator rehearsal

Version: 0.2.0-draft · Updated: 2026-09-19 · Status: three-host interim rehearsal active

## 2026-09-19 laptop validation increment

The laptop joined through a localhost SSH P2P tunnel to the VPS validator.
The topology for this increment is GPU miner → VPS validator → laptop validator.
The laptop runs Core-Geth in Ubuntu WSL without mining enabled. Its binary is
byte-identical to the VPS build (SHA-256
`d2071e4de187e81e91333bdb54a59aed7ff8b268ad014761f0df0e5f5e4da2ad`).
The genesis file SHA-256 is
`0c4bee1d43397b835a3aca44be1e81d08acd76ca5946a1f3ca24e1e262df0ab4`.

- Initial snap synchronization reached block 4,605 and reported syncing=false.
  This is state synchronization evidence, not full historical execution replay.
- Miner, VPS and laptop returned the same canonical block 4,615 hash:
  `0x439c227769e6e69887fefc6b538b98c71d36d229f58e96a1568aa5588d032025`.
- The laptop shut down cleanly and restarted from its preserved database. It
  imported a five-block segment in 102.661 ms and resumed live imports.
  The separate 100-block laptop downtime exercise remains outstanding.
- VPS resource collection completed 720 samples over 7,193.65 seconds between
  first and last samples. The GPU resource output also exists; full resource
  and alert review is pending.
- The early 100-block timing sample averaged 3.646 seconds with an undersized
  initial difficulty. Later blocks 4,522–4,622 averaged 9.82 seconds per interval;
  difficulty at block 4,622 was 116,738,329. This supports observed convergence
  toward the configured 10-second target, not a final launch calibration.

AVR/proof traffic, the full laptop downtime exercise, combined monitoring review,
and the final interim acceptance report remain outstanding. Runtime files and
credentials are kept outside tracked source. Temporary relay access remains
in use and must be removed when the rehearsal is closed.

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
- The existing Ethash devnet and completed governance-delay evidence are not used.
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

See the [19 September 2026 rehearsal results](./phase-4-rehearsal-2026-09-19.md)
for receipt/batch/proof smoke tests, laptop recovery, resource samples, and the
binary standardization and pending recovery/health gates. These results are
interim, not policy acceptance.

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
