# Halo2 Feasibility — ZK-001 Policy Evaluation

| Field | Value |
| --- | --- |
| Status | Evaluation only — no implementation selected |
| Version | 0.1 |
| Last updated | 2026-08-28 |
| Decision | **Defer a full Halo2 circuit until SP1 and RISC Zero evidence is captured.** |

## Scope

This assessment concerns the fixed ZK-001 statement: prove that private AI-execution-policy inputs satisfy a committed policy and that the exact AVR public bindings are reproduced. It does not change the statement, privacy boundary, or assurance claims in the ZK-001 documentation.

## Feasibility result

Halo2 is technically feasible, but it is not the lowest-risk first implementation for this project. ZK-001 would need a bespoke circuit rather than a direct execution of the shared Rust reference logic. That circuit would have to constrain:

- the private action, policy allowlist, and blinding values;
- the commitment/hash construction and domain separation;
- policy membership and expiry logic;
- every public AVR binding; and
- deterministic encoding between the AVR schema and field elements.

The upstream Halo2 design is a PLONKish circuit system: the relation must be expressed as field constraints, with witness values in advice columns and public inputs in instance columns. It supports multi-instance proving and parallel proving, but neither property removes the circuit-design and audit work required here. See the [Halo2 concepts](https://zcash.github.io/halo2/concepts/arithmetization.html), [proof model](https://zcash.github.io/halo2/design/implementation/proofs.html), and [development tools](https://zcash.github.io/halo2/user/dev-tools.html).

## Why defer it

| Criterion | SP1 / RISC Zero zkVM evaluation | Halo2 evaluation |
| --- | --- | --- |
| Reuse of tested semantic logic | High: a shared Rust core can run as guest code | Low: rewrite relation as constraints |
| First proof path | Shorter | Longer |
| Circuit-specific audit surface | Lower initially | High |
| Fine-grained optimisation potential | Medium | High, after specialised engineering |
| EVM integration | Candidate-dependent and still to be measured | Requires a compatible commitment/verifier path and custom integration |

This is a sequencing decision, not a rejection of Halo2. A bespoke circuit may be valuable later if ZK-001 becomes stable, proven workload data shows zkVM cost is unacceptable, and a specific EVM-verification approach is selected.

## Required gate before a Halo2 build

Start a dedicated Halo2 spike only after all of the following are recorded:

1. SP1 and RISC Zero prove-and-verify evidence for the same fixture.
2. Measured proof time, proof size, CPU/memory, and verifier cost for both candidates.
3. A frozen encoding of every ZK-001 public binding.
4. A committed choice of hash primitive(s) that can be constrained efficiently and is compatible with the AVR commitment strategy.
5. A named EVM verification deployment target and verifier-upgrade model.
6. Security review capacity for a custom circuit and its test vectors.

## If the gate is passed

The first Halo2 task is deliberately small: implement a `MockProver` circuit for one private action/policy commitment and one public receipt binding; include valid and invalid witnesses. Do not add a production prover, aggregation, or an on-chain verifier until that circuit is independently reviewed and benchmarked.

## Non-claims

- No Halo2 circuit, proof, verifier, benchmark, or EVM integration exists in this repository yet.
- This document does not select a proving stack.
- This document does not promise any target proving time, cost, privacy property beyond ZK-001, or transaction throughput.
