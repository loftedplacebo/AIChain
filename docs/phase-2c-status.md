# Phase 2C Status: ZK Stack Prototypes

| Field | Value |
|---|---|
| Status | In progress |
| Evaluation statement | ZK-001 policy evaluation `0.1.0-draft` |
| Last updated | 2026-08-28 |

## SP1

- Version pinned: `6.5.0`.
- Semantic core: implemented and tested against the shared golden vector in Linux CI.
- Guest: implemented; reconstructs the receipt ID, commitments root, result commitment, identity bindings, statement ID, and program commitment from the witness before committing public values.
- Guest execution and native proof/verification workflows: completed successfully. The evidence is recorded in [Phase 2C Native Proof Evidence](./phase-2c-native-proof-evidence.md).
- Proof-public-value binding: the host runner decodes the verified proof journal and requires an exact match with the shared fixture.
- EVM verifier export, Solidity deployment, gas measurements, and cryptographic negative-proof verification: not yet complete.

## RISC Zero

- Candidate baseline: stable `3.0.3`.
- Adapter and host harness: implemented, using the same Rust semantic core and fixture as SP1. The host requires an exact public-journal match and independently verifies the receipt.
- Native receipt generation and independent verification: completed successfully. The evidence is recorded in [Phase 2C Native Proof Evidence](./phase-2c-native-proof-evidence.md). EVM integration has not started.

## Halo2

- A feasibility assessment is complete in [Phase 2C Halo2 Feasibility](./phase-2c-halo2-feasibility.md).
- It remains an evaluation candidate. A bespoke-circuit spike is deliberately deferred until comparable SP1/RISC Zero measurements and a frozen public-input encoding exist.

## Evidence Discipline

No system is selected. A successful guest execution proves only that the zkVM can execute the agreed program and emit the expected public values. A stack becomes viable for alpha only after cryptographic proof generation, independent verification, binding/substitution negatives, an EVM verifier demonstration, measurements, and security/privacy review.
