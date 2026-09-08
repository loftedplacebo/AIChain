# Phase 4 — Acceptance thresholds and monitoring policy

Version: 0.1.0-draft · Updated: 2026-09-08 · Status: approved development baseline

## Boundary

This policy makes the Phase 4 closed-testnet acceptance criteria measurable. It
does **not** select mainnet economics, a final chain ID, public capacity, final
confirmation security, or a value-bearing bridge policy. Passing it means only
that the controlled testnet is ready for a recorded Phase 4 review.

The machine-readable sources are:

- [`../config/phase4-acceptance-policy-v0.1.0-draft.json`](../config/phase4-acceptance-policy-v0.1.0-draft.json)
- [`../config/phase4-monitoring-alert-policy-v0.1.0-draft.json`](../config/phase4-monitoring-alert-policy-v0.1.0-draft.json)

Changing a threshold requires a documented decision with the prior result,
reason, owner and effective test epoch. It must never be relaxed silently to
turn a failed run into a pass.

## Acceptance thresholds

| Area | Closed-testnet threshold | Basis and interpretation |
|---|---|---|
| Observation size | ≥1,000 blocks and a 24-hour soak | Avoids treating short GPU demonstrations as capacity evidence. |
| Block cadence | 7–15 s mean; ≤45 s p95; ≤90 s p99 | 10-second ASERT development profile; a testnet gate, not a final block-time promise. |
| Propagation | ≤2 s p95 observation | Must be measured across regions; polling resolution/clock uncertainty must be recorded. |
| Canonical chain | 100% independent validator hash agreement | Any unexplained divergence is a critical failure. |
| Natural stale rate | ≤3% over the observed window | Forced-fork test branches are excluded and reported separately. |
| CPU verification | ≤150 ms p95; ≤1 s maximum | Guardrail based on prior CPU-only validation, not a hardware-sizing promise. |
| Controlled reorg recovery | ≤60 s | Must include indexer canonical replay. |
| Ingress | ≤100 ms acceptance p95; queue remains ≤10,000 | Immediate acceptance remains provisional, not durable inclusion. |
| Batch inclusion | ≤60 s p95 | Six 10-second blocks gives a conservative closed-testnet service target. |
| Logical receipt throughput | ≥50 confirmed receipts/s at batch size 100 | A minimum gated workload, not network TPS or a maximum claim. |
| Indexer | ≤2-block lag; rebuild ≤5 min | Must be tested after restart and reorganisation. |
| Proof path | queue p95 ≤5 min; verifier ≤350,000 gas | Current proof data supports a conservative alpha budget; no proof is accepted on queue timing alone. |
| Resource growth | p95 CPU ≤80% of one core; RSS ≤4 GiB; state growth ≤1 GiB/24 h | Per-role monitoring guardrails pending representative operator hardware. |

The proof byte/journal limits are the already-enforced alpha caps (1,024 and
2,048 bytes). The final bridge/irreversible-action confirmation tier remains
unset; no bridge is authorized by this policy.

## Confirmation labels

For the closed testnet, display labels rather than guarantees:

| Label | Blocks | Meaning |
|---|---:|---|
| Observed | 1 | Visible and provisionally included. |
| Standard | 6 | Candidate ordinary AVR confirmation point under measurement. |
| High assurance | 30 | Candidate organisational checkpoint point under measurement. |
| Bridge/irreversible | Unset | Must be separately designed after finality and security evidence. |

## Monitoring and response

Telemetry remains private. Each role reports build/genesis identity, head and
peers, block/verification/reorg metrics, ingress/batch/indexer/proof metrics,
and resource growth. The monitoring policy defines six initial alerts:

- **Critical:** genesis/build mismatch, public RPC exposure, canonical divergence
  or invalid input acceptance. These freeze the affected exercise, preserve
  evidence and require investigation.
- **Warning:** missing blocks/peers, queue/indexer pressure, or proof/resource
  budget breach. These trigger documented backpressure or reduced load; they
  are acceptance failures unless an explicit review records a different outcome.

Neither an alert nor a failed test justifies resetting state or rewriting
history. Preserve evidence first, then follow the relevant recovery runbook.

The implementation and role-local collection instructions are in the
[Phase 4 private metrics pipeline](./phase-4-private-metrics-pipeline.md).

## Report evaluation

The acceptance-report generator now accepts `--policy` and applies its
deterministic checks to observed network, resource and fault results:

```bash
python3 scripts/generate-phase4-acceptance-report.py \
  --policy config/phase4-acceptance-policy-v0.1.0-draft.json \
  --fault-results evidence/fault-results.json \
  --network-observation evidence/network-observation.json \
  --miner-resources evidence/resources-miner.json \
  --validator-resources evidence/resources-validator.json \
  --output evidence/phase4-acceptance-report.json
```

Missing evidence produces `incomplete-evidence`; a measured threshold breach
produces `threshold-breach`; only a complete measurement set with all automated
checks passing produces `review-required`. No automated result is a release
approval.

## Deferred items

The following remain Phase 4/5 review work: actual multi-region measurements,
AMD/OpenCL results, proof-spam economics, durable ingress infrastructure,
external security review, final difficulty/issuance/fee parameters, public API
exposure, and any stablecoin or bridge.
