# Phase 4 — Private metrics and alert pipeline

Version: 0.1.0-draft · Updated: 2026-09-08 · Status: disposable-node validated

## Boundary

The pipeline collects a **snapshot**, evaluates it against private monitoring
rules, and supplies reviewed aggregates to the Phase 4 acceptance report. It
does not start, stop, reconfigure, partition, reset, mine, unlock an account,
or contact a non-loopback RPC endpoint.

```text
Loopback node RPC + optional local process counters
                  │
                  ▼
 private metrics snapshot (one role, one moment)
                  │
                  ├──► private alert evaluation
                  │
                  └──► reviewed aggregates → acceptance report
```

The collector rejects non-loopback URLs. Snapshots deliberately omit RPC URLs,
filesystem paths, keys, passwords, raw AI evidence, proof witnesses and API
credentials.

## Collecting snapshots

On each closed-testnet role, use the approved build digest and expected genesis
identity from the release record:

```bash
python3 scripts/collect-phase4-metrics.py \
  --role validator \
  --rpc-url http://127.0.0.1:18546 \
  --build-id 0xREPLACE_WITH_APPROVED_BUILD_DIGEST \
  --expected-genesis 0xREPLACE_WITH_APPROVED_GENESIS_HASH \
  --expected-chain-id REPLACE_CHAIN_ID \
  --pid NODE_PID --data-dir /absolute/closed-testnet/validator \
  --output evidence/private/validator-snapshot.json
```

`--pid` and `--data-dir` are optional together. On Linux they add local CPU
ticks, memory, disk-byte and interface-counter values. They do not expose the
path in the saved output. Run the collector on the relevant host; do not tunnel
or expose RPC merely to collect metrics.

## Evaluating alerts

Collect at least a miner and independent validator snapshot at the same logical
observation point, then evaluate them locally:

```bash
python3 scripts/evaluate-phase4-alerts.py \
  --policy config/phase4-monitoring-alert-policy-v0.1.0-draft.json \
  --snapshot evidence/private/miner-snapshot.json \
  --snapshot evidence/private/validator-snapshot.json \
  --output evidence/private/alert-evaluation.json
```

The initial evaluator detects:

- critical genesis/build identity mismatch;
- critical conflicting canonical hashes at the same height; and
- warning loss of required miner/validator peer connectivity.

The monitoring policy also defines operational alerts for public-RPC exposure,
block cadence, queue/indexer pressure and resource/proof budget breaches. Those
are evaluated from the corresponding multi-sample and ingress/proof evidence,
not falsely inferred from a single snapshot.

## Evidence flow and review

Feed reviewed, public-safe observation/resource/fault files into the existing
[acceptance report](./phase-4-measurement-and-fault-harness.md). The report
checks the separate [acceptance policy](./phase-4-acceptance-and-monitoring-policy.md)
and yields `incomplete-evidence`, `threshold-breach`, or `review-required`.
It never automatically approves a testnet phase.

Keep raw snapshots and alert output access-controlled during the closed testnet.
For any public report, publish only the selected aggregate results and file
hashes. Critical alerts freeze the affected exercise and require evidence
preservation and investigation.

## Validation status

The collector and alert evaluator have been tested with a local JSON-RPC test
server and a fresh loopback-only disposable Core-Geth node. The test confirms
genesis/chain identity collection and normal alert evaluation; it is not a
multi-peer or production-monitoring result.
