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
- Guest execution: automated workflow added; pending its first completed run.
- Cryptographic proof, EVM verifier export, Solidity deployment, gas measurements, and negative proof verification: not yet complete.

## RISC Zero

- Candidate baseline: stable `3.0.3`.
- Adapter: next implementation task, using the same Rust semantic core and fixture.
- No result is recorded yet.

## Halo2

- Not started.
- It remains an evaluation candidate; a bespoke-circuit effort spike will be used to decide whether a full prototype is proportionate.

## Evidence Discipline

No system is selected. A successful guest execution proves only that the zkVM can execute the agreed program and emit the expected public values. A stack becomes viable for alpha only after cryptographic proof generation, independent verification, binding/substitution negatives, an EVM verifier demonstration, measurements, and security/privacy review.
