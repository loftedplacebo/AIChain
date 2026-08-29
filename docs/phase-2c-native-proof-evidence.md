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
| SP1 `6.5.0` | Invalid witness, wrong verifier key, tampered public values, and wrong receipt binding | Success | 10m 35s | Included in proof workflow | [GitHub Actions run 33208474701](https://github.com/loftedplacebo/AIChain/actions/runs/33208474701) |
| RISC Zero `3.0.3` | Invalid witness, wrong image ID, tampered journal, and wrong receipt binding | Success | 10m 47s | Included in proof workflow | [GitHub Actions run 33206774076](https://github.com/loftedplacebo/AIChain/actions/runs/33206774076) |

The workflow durations include fresh-runner setup, dependency compilation, guest compilation, and toolchain installation. They are evidence of successful interoperability, not comparable proving-time benchmarks.

## What this establishes

- The shared ZK-001 semantic program executes inside both candidate zkVMs.
- Both candidates can generate a native cryptographic proof or receipt for the shared fixture.
- Both candidate hosts independently verify their native proof or receipt.
- The verified public output is decoded and required to match the exact expected AVR bindings.

## What remains unproved

- The five-warm-up and ten-measured-proof sample required for a production stack recommendation.
- Formal verifier latency distribution, dependency/build-size comparison, and repeated peak-memory distribution.
- Aggregation, production security, trusted-setup policy, or a final stack selection.

## Next gate

The native negative-proof gate and EVM verifier trial are complete. Continue with the repeated benchmark, assurance/privacy review, verifier governance and upgrade design, trusted-setup assessment, and an explicit ZK-002 stack decision. See [Phase 2C EVM Verifier Evidence](./phase-2c-evm-verifier-evidence.md).
