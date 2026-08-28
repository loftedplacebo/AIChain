# Phase 2C Native Proof Evidence

| Field | Value |
| --- | --- |
| Status | Completed |
| Evidence date | 2026-08-28 |
| Statement | ZK-001 policy evaluation `0.1.0-draft` |
| Fixture | `fixtures/zk/policy-evaluation-v0.1.0-draft.json` |

## Successful runs

| Stack | Test | Result | Workflow duration | Main-step duration | Evidence |
| --- | --- | --- | ---: | ---: | --- |
| SP1 `6.5.0` | Guest execution and exact public-value comparison | Success | 10m 50s | 10m 04s | [GitHub Actions run 33174016401](https://github.com/loftedplacebo/AIChain/actions/runs/33174016401) |
| SP1 `6.5.0` | Native proof generation, independent verification, and exact proof-public-value comparison | Success | 11m 19s | 10m 06s | [GitHub Actions run 33174016376](https://github.com/loftedplacebo/AIChain/actions/runs/33174016376) |
| RISC Zero `3.0.3` | Native receipt generation, independent verification, and exact journal-public-value comparison | Success | 9m 01s | 7m 50s | [GitHub Actions run 33174125313](https://github.com/loftedplacebo/AIChain/actions/runs/33174125313) |

The workflow durations include fresh-runner setup, dependency compilation, guest compilation, and toolchain installation. They are evidence of successful interoperability, not comparable proving-time benchmarks.

## What this establishes

- The shared ZK-001 semantic program executes inside both candidate zkVMs.
- Both candidates can generate a native cryptographic proof or receipt for the shared fixture.
- Both candidate hosts independently verify their native proof or receipt.
- The verified public output is decoded and required to match the exact expected AVR bindings.

## What remains unproved

- Tampered-proof, wrong-key, wrong-receipt, and proof-substitution rejection at the cryptographic layer.
- Comparable warm-cache proving time, proof size, peak memory, and verifier latency.
- EVM-compatible proof generation, Solidity verification, deployment, or gas cost.
- Aggregation, production security, trusted-setup policy, or a final stack selection.

## Next gate

Implement the cryptographic negative-proof suite for both candidates. Only after those tests pass should either candidate advance to an EVM verifier trial.
