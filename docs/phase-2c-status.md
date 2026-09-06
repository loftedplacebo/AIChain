# Phase 2C Status: ZK Stack Prototypes

| Field | Value |
|---|---|
| Status | RISC Zero selected for initial ZK-001 implementation; release hardening remains open |
| Evaluation statement | ZK-001 policy evaluation `0.1.0-draft` |
| Last updated | 2026-08-29 |

## SP1

- Version pinned: `6.5.0`.
- Semantic core: implemented and tested against the shared golden vector in Linux CI.
- Guest: implemented; reconstructs the receipt ID, commitments root, result commitment, identity bindings, statement ID, and program commitment from the witness before committing public values.
- Guest execution and native proof/verification workflows: completed successfully. The evidence is recorded in [Phase 2C Native Proof Evidence](./phase-2c-native-proof-evidence.md).
- Proof-public-value binding: the host runner decodes the verified proof journal and requires an exact match with the shared fixture.
- Groth16 EVM export, official Solidity verifier deployment, gas measurement, and on-chain negative tests: completed. See [Phase 2C EVM Verifier Evidence](./phase-2c-evm-verifier-evidence.md).

## RISC Zero

- Candidate baseline: stable `3.0.3`.
- Adapter and host harness: implemented, using the same Rust semantic core and fixture as SP1. The host requires an exact public-journal match and independently verifies the receipt.
- Native receipt generation and independent verification: completed successfully. The evidence is recorded in [Phase 2C Native Proof Evidence](./phase-2c-native-proof-evidence.md).
- Groth16 EVM export, official Solidity verifier deployment, gas measurement, and on-chain negative tests: completed. See [Phase 2C EVM Verifier Evidence](./phase-2c-evm-verifier-evidence.md).

## Halo2

- A feasibility assessment is complete in [Phase 2C Halo2 Feasibility](./phase-2c-halo2-feasibility.md).
- It remains an evaluation candidate. A bespoke-circuit spike is deliberately deferred until comparable SP1/RISC Zero measurements and a frozen public-input encoding exist.

## Selection

The completed repeated benchmark and EVM interoperability evidence support the
accepted ZK-002 decision: **RISC Zero is the initial AIChain AVR proof stack**.
See [Repeated Benchmark Results](./phase-2c-repeated-benchmark-results.md)
and [ADR-0006](./decisions/0006-risc-zero-initial-proof-stack-selection.md).

## Evidence Discipline

Both zkVM candidates crossed the prototype interoperability gate, including
byte-identical public values and real EVM verification. RISC Zero is selected
for the initial ZK-001 implementation. Production release still requires the
remaining security/privacy, verifier-governance, trusted-setup, versioning,
resource-limit, and aggregation-scope work described in ADR-0006.
