# ADR-0005: First ZK Statement Is Private Policy Evaluation

| Field | Value |
|---|---|
| Status | Accepted for Phase 2B evaluation |
| Date | 2026-08-28 |
| Decision IDs | ZK-001; partial evaluation scope for ZK-005 |

## Context

Selecting a proof stack before defining the claim would produce incomparable prototypes and risk overstating assurance. Proving frontier-model inference is currently too broad and does not directly address the initial enterprise privacy use case.

## Decision

Use the versioned deterministic private policy-evaluation statement in [ZK-001](../zk-001-policy-evaluation-statement.md) as the common workload for RISC Zero, SP1, and Halo2 evaluation.

It proves correct execution of a small allowlist policy over committed private data and binds the result to an Authorised AVR. It does not prove model inference, real-world execution, provider provenance, organisational trust, or historical authority.

## Consequences

- Candidate stacks can be compared against one stable semantic contract and golden vector.
- The first useful private claim is deliberately narrow and explainable.
- Authority validation remains a separate statement or composed verification step.
- This decision does not select a ZK stack, aggregation design, or on-chain verifier.
- The statement remains draft until implementation, privacy, security, and verifier reviews are complete.

