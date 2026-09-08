# Phase 4 — Measurement and fault-test harness

Version: 0.1.0-draft · Updated: 2026-09-08 · Status: pre-provisioning

## Purpose

This harness turns a controlled closed-testnet exercise into a reviewable,
public-safe evidence bundle. It is intentionally divided into three parts:

```text
Approved controlled test plan
          │ validate only; no execution
          ▼
Manual operator exercise ──► existing node/resource observers ──► reviewed aggregates
                                                                  │
                                                                  ▼
                                                       acceptance-report draft
```

No script in this harness starts, stops, partitions, resets, reconfigures or
connects to a node. Fault injection remains an explicit operator action after
separate approval, on the closed testnet only.

## Controlled fault plan

[`../fixtures/phase4/fault-plan-v0.1.0-draft.json`](../fixtures/phase4/fault-plan-v0.1.0-draft.json)
is the initial plan. It requires approval, explicitly prohibits the operational
devnet and public networks, gives every exercise a maximum duration,
preconditions, rollback steps and expected invariants.

Validate a reviewed copy before scheduling any exercise:

```bash
python3 scripts/validate-phase4-fault-plan.py fixtures/phase4/fault-plan-v0.1.0-draft.json
```

Required coverage is:

| Exercise | What it establishes | Never do |
|---|---|---|
| Validator partition | catch-up and canonical recovery after bounded isolation | partition the operational devnet or public network |
| Validator restart | datadir recovery and sync from an independent miner | reset the datadir to make the test pass |
| Competing branch/reorg | greater-work choice and indexer replay | fabricate a canonical result or hide orphaned blocks |
| Malformed submission | invalid blocks, AVR and proof inputs fail closed | use production/private evidence |
| Bounded load | queue, deduplication, batch, indexer and recovery behaviour | interpret it as public-network TPS |

## Measurements

Use the existing observers to collect safe aggregates:

```bash
python3 scripts/observe-kawpow-g3-network.py \
  --mining-rpc http://127.0.0.1:18545 \
  --validator-rpc http://127.0.0.1:18546 \
  --blocks 20 --output evidence/network-observation.json

python3 scripts/sample-kawpow-g3-resources.py \
  --pid NODE_PID --data-dir /absolute/testnet/node \
  --duration 300 --output evidence/resources-validator.json
```

The first observation gives block production and a polling-bounded propagation
observation—not an exact wire-latency measurement. Resource sampling provides
CPU, memory, disk and interface byte growth; it does not expose wallet material.

Record these fields for every accepted exercise:

- genesis and build/artifact digests;
- participating role count and geographic-region count, without public IPs;
- block production, propagation-observation, confirmation and reorg timing;
- stale/orphan count and total candidate block count;
- CPU, memory, disk and bandwidth samples by role;
- queue depth, rejection/deduplication counts, batch sizes, indexer lag and
  recovery/rebuild time; and
- proof queue time, proof generation time, verification gas and rejection reason.

## Fault results and acceptance draft

After the manual exercise, create a reviewed, non-secret `fault-results.json`:

```json
{
  "schema": "aichain.phase4-fault-results",
  "experiments": [
    {"id": "validator-partition", "kind": "partition", "status": "passed"}
  ]
}
```

Generate a report draft without controlling any infrastructure:

```bash
python3 scripts/generate-phase4-acceptance-report.py \
  --fault-results evidence/fault-results.json \
  --network-observation evidence/network-observation.json \
  --miner-resources evidence/resources-miner.json \
  --validator-resources evidence/resources-validator.json \
  --output evidence/phase4-acceptance-report.json
```

The report identifies missing or failed test classes and source-file digests.
Pass the approved closed-testnet policy with `--policy` to evaluate the measured
network and resource thresholds. It still only reports `review-required`, never
“production ready.” See [Phase 4 acceptance and monitoring policy](./phase-4-acceptance-and-monitoring-policy.md).

## Evidence safety

Only feed the report generator reviewed, public-safe aggregate files. Do not
include private keys, keystores, passwords, raw private AI evidence, witness
inputs, API credentials, or private IP/endpoints. Preserve restricted raw logs
separately with access control and integrity hashes.

## Relationship to the deployment foundation

This is the next implementation increment from the
[closed-testnet deployment foundation](./phase-4-closed-testnet-foundation.md).
It becomes operational only after the Phase 4 entry checklist is satisfied,
including the remaining real Phase 3 governance-delay result and the required
multi-operator hardware.
