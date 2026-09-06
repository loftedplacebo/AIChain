# ADR-0007: ZK-003 Individual-Proof Batches for Alpha

| Field | Value |
| --- | --- |
| Status | Accepted for alpha scope |
| Date | 2026-09-06 |
| Decision ID | ZK-003 |
| Depends on | ZK-001 `0.1.0-draft`, ZK-002 / ADR-0006 |

## Context

AIChain needs a scale path for high-volume AVR verification without claiming
that a Merkle commitment is itself a zero-knowledge aggregate proof. The
selected initial proof system is RISC Zero, but recursive proof aggregation,
proof queues, and production verifier governance have not yet been measured or
specified.

The existing `ReceiptBatchAnchor` prototype already anchors opaque Merkle roots
on the EVM chain and supplies sorted-pair membership semantics. Its measured
capacity evidence demonstrates that a root can represent many receipts, but a
plain receipt-root does not bind a particular ZK statement, proof artifact, or
proof-system version.

## Decision

1. **The alpha proof mode is individual RISC Zero proofs.** Each accepted
   ZK-001 claim remains independently verifiable against its exact public
   inputs. No recursive or aggregate proof is claimed or required in alpha.
2. **Proof claims may be batched off-chain.** A versioned proof-batch manifest
   commits a Merkle root of one leaf per individual claim. Every leaf binds:
   proof-system identifier, statement ID, program commitment, AVR receipt ID,
   public-values digest, and proof-artifact digest.
3. **A batch is homogeneous.** All claims in a manifest must use the same
   proof-system ID, statement ID, and program commitment; duplicate receipt IDs
   are rejected. This prevents a batch from disguising mixed proof semantics.
4. **A proof-batch root may be anchored through the existing development
   `ReceiptBatchAnchor` with a distinct schema version.** That anchor records
   historical inclusion of a root. It does not verify RISC Zero proofs or make
   proof data available.
5. **Recursive/aggregate proof verification is deferred.** It needs separate
   benchmarks, queue/failure design, verifier review, and an explicit follow-up
   decision before it can enter a release.

## Assurance language

| State | What it establishes | What it does not establish |
| --- | --- | --- |
| Receipt batch anchored | A receipt ID is committed under an L1-anchored root | That it has a valid ZK proof |
| Proof claim batched | A specific proof claim is committed under a root | That the underlying proof was verified on-chain |
| Individually ZK-proved | The selected verifier accepted the exact ZK-001 public inputs | General AI correctness, real-world execution, or aggregate coverage |
| Aggregate-proved | **Not supported in alpha** | N/A |

## Consequences

This path gives applications an immediately usable, low-complexity batching
format and deterministic inclusion proofs while retaining exact per-receipt
proof semantics. It avoids prematurely creating a consensus rule, rollup, or
recursive prover service. The trade-off is that individual on-chain proof
verification cost remains per proof; batching reduces anchor, indexing, and
distribution overhead, not verifier cost.

Proof bytes and public-value payloads remain off-chain. The batch stores only
their digests, so the party claiming proof availability must supply the proof
artifact and inclusion package. Data availability, retention, access control,
retry, reorganisation, and queue policies remain release work.

## Required follow-up before aggregate proofs

1. Define supported batch sizes, queue ownership, retry/expiry, and failure
   behavior under load.
2. Benchmark RISC Zero recursion/aggregation with actual AVR workloads,
   including proving latency, memory, proof sizes, EVM verification gas, and
   cost versus individual proofs.
3. Specify proof/manifest availability and reorganisation-safe anchoring rules.
4. Complete ZK-004 verifier ownership, upgrades, resource limits, emergency
   controls, and security-review acceptance criteria.
5. Record a separate decision before any aggregate proof is described as
   supported.

## References

- [Proof batching specification](../zk-003-proof-batching.md)
- [ADR-0006: RISC Zero initial proof-stack selection](./0006-risc-zero-initial-proof-stack-selection.md)
- [Capacity and batching prototype](../capacity-and-batching-prototype.md)
