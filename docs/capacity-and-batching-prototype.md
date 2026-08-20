# Capacity and Batching Prototype

| Field | Value |
|---|---|
| Status | Phase 1B capacity prototype |
| Document version | 0.1 |
| Last updated | 2026-08-20 |
| Protocol status | Non-final; does not select the production rollup or batching design |
| Companion documents | [Development Plan](./development-plan.md); [AI Verification & ZK Architecture](./ai-verification-and-zk-architecture.md) |

## 1. Objective

Measure the trade-off between anchoring every AVR individually and anchoring a Merkle root representing many receipt identifiers. The prototype reports distinct metrics for L1 transactions and logical receipts; it must never describe batched logical receipt throughput as raw L1 transaction throughput.

## 2. Batch Anchor Model

`ReceiptBatchAnchor` records an opaque `batchRoot`, leaf count, schema version, submitting issuer, and inclusion time. The root is constructed from receipt IDs using sorted Keccak-256 pair hashing. A verifier can submit a receipt ID and Merkle proof to `verifyMembership`.

The prototype does not store raw receipts, proofs, off-chain batch data, ZK proofs, agent authority checks, or data-availability guarantees. It is a direct-anchor efficiency experiment, not a production rollup.

## 3. Measurement Definitions

| Metric | Definition |
|---|---|
| Confirmed transaction TPS | Successfully included batch-anchor transactions divided by elapsed benchmark time |
| Confirmed logical receipt TPS | Sum of receipt leaves successfully included divided by elapsed benchmark time |
| Batch size | Number of receipt IDs represented by one anchored root |
| Submission latency | Time from transaction submission to the benchmark runner receiving a successful receipt |
| Confirmation latency | For this serial devnet baseline, equivalent to observed submission latency; production confirmation policy remains TBD |
| Per-receipt gas | Batch transaction gas used divided by leaf count |

## 4. Required Benchmark Labels

Every result must include:

- chain ID, node count, consensus/development parameters, and hardware;
- receipt count, batch size, number of batch transactions, and schema version;
- whether transactions are serial or concurrent;
- whether the metric includes confirmation waits;
- client/node/indexer configuration; and
- known bottlenecks and failure behavior.

A single-node serial result is a local baseline only. It is not P2P propagation capacity, decentralized consensus throughput, or a public-network TPS claim.

## 5. Next Validation Steps

1. Deploy `ReceiptBatchAnchor` on the private devnet.
2. Generate deterministic synthetic receipt IDs at several batch sizes.
3. Run controlled serial baselines and save a machine-readable report.
4. Verify membership proofs against selected anchored roots.
5. Repeat with multi-node P2P topology once the Contabo firewall issue is resolved.
6. Compare direct anchors, Merkle batches, and later proof/rollup candidates under the same workload definition.

### 5.1 Prototype Commands

On the VPS, create a 100-receipt workload in 10-receipt batches:

```bash
cd /opt/aichain
python3 ./benchmarks/generate-receipt-batches.py \
  --receipt-count 100 --batch-size 10 \
  --output /opt/aichain/devnet/benchmark-100x10.json
```

After deploying `ReceiptBatchAnchor`, run the serial confirmed baseline:

```bash
BATCH_ANCHOR_ADDRESS=0xDEPLOYED_CONTRACT \
  bash ./scripts/benchmark-batch-anchor.sh \
  /opt/aichain/devnet/benchmark-100x10.json \
  /opt/aichain/devnet/benchmark-100x10-report.json
```

The runner creates roots using the same sorted Keccak-256 pair construction as the contract and reports **confirmed transaction TPS** and **confirmed logical receipt TPS** separately.

## 6. Open Decisions

| ID | Decision | Status |
|---|---|---|
| SCALE-001 | Production receipt batching, aggregation, recursion, and throughput strategy | TBD |
| SCALE-002 | Workload, confirmation, and capacity targets | TBD |
| SCALE-003 | Batch data availability, inclusion-proof distribution, retry, and audit model | TBD |
| SCALE-004 | Whether batching is contract-level, native protocol, rollup-based, or hybrid | TBD |

## 7. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-20 | Initial batch-anchor capacity prototype |
