# Phase 2 Evaluation Charter

| Field | Value |
|---|---|
| Status | Active evaluation charter — no selections made |
| Version | 0.1 |
| Last updated | 2026-08-22 |
| Tracks | Phase 2A PoW/network and Phase 2B ZK statement/stack |

## Purpose

Phase 2 turns validated receipt prototypes into measured decision inputs. It does not freeze consensus, network economics, a ZK stack, or a proof claim until the relevant decision gate is passed.

## Track A — PoW and Network Evaluation

### Decision to support

**L1-001:** select a GPU-friendly PoW algorithm with a documented quantum-threat assessment and upgrade posture.

### Evaluation rubric

Every candidate must be assessed using the same declared hardware, node build, workload, and attack assumptions:

| Dimension | Required evidence |
|---|---|
| GPU accessibility | Performance across at least two representative consumer/professional GPU classes; memory and power profile |
| Centralisation | ASIC/FPGA exposure, pool dynamics, hardware supply concentration, and memory-bandwidth advantage analysis |
| Node cost | Full block validation time, memory, bandwidth, disk, and propagation effect |
| Security | Difficulty adjustment, selfish-mining/pool concentration, timestamp, reorganisation, and DoS analysis |
| Quantum posture | Clearly state which primitives are affected, what quantum advantage is assumed, and what upgrade/migration remains necessary |
| Implementation | Core-Geth integration scope, test vectors, licence/maturity, auditability, and safe activation/rollback path |
| AVR capacity | Measured confirmation distribution, orphan/reorg behaviour, and receipt/batch throughput under the declared workload |

No benchmark may use a single headline TPS number without the workload, batch size, confirmation definition, hardware, and failure conditions.

### First deliverables

1. Candidate shortlist and exclusion rationale.
2. Reproducible benchmark harness and environment manifest.
3. Threat-model template and quantum-assumption worksheet.
4. Report comparing the candidates; recommendation remains a separate ADR.

## Track B — ZK Statement and Stack Evaluation

### Candidate first statement

The first **candidate** statement is not frontier-model inference correctness:

> A committed receipt action was evaluated by a versioned deterministic policy against committed configuration and authority inputs, and the declared policy result was allowed.

### Candidate public inputs

```json
{
  "statementId": "aichain.policy-compliance",
  "statementVersion": "0.1.0-draft",
  "receiptId": "0x<bytes32>",
  "commitmentsRoot": "0x<bytes32>",
  "policyCommitment": "0x<bytes32>",
  "configurationCommitment": "0x<bytes32>",
  "authorityCommitment": "0x<bytes32>",
  "ruleSetCommitment": "0x<bytes32>",
  "verifierKeyCommitment": "0x<bytes32>"
}
```

The private witness, exact policy language, result details, and private action data remain off-chain. A successful proof would establish only the encoded statement for these inputs.

### Evaluation rubric

Compare RISC Zero, SP1, Halo2, and any later candidate against:

- statement expressiveness and deterministic execution model;
- proving time, memory, proof size, verifier gas, and recursion/aggregation options;
- soundness/security maturity and verification-key upgrade model;
- developer ergonomics, reproducibility, and EVM integration;
- queueing, retry, and batch behaviour at receipt volumes derived from Phase 1B measurements.

### First deliverables

1. Threat model for the candidate statement and witness/public-input boundary.
2. Deterministic policy test vectors with positive, negative, substituted-input, and wrong-version cases.
3. Minimal off-chain prover/on-chain verifier spikes for evaluated stacks.
4. Measured comparison report; stack selection remains a separate ADR.

## Decision discipline

- Track A closes **L1-001** only through an explicit ADR with benchmarks and quantum assessment.
- Track B does not close **ZK-001** until the statement and public inputs above are accepted or replaced explicitly.
- L1-003, L1-004, ZK-002–005, and all economic/upgrade decisions remain **TBD**.

