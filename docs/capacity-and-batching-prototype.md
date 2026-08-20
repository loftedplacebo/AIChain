# Capacity and Batching Prototype

| Field | Value |
|---|---|
| Status | Phase 1B capacity prototype |
| Document version | 0.5 |
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
  --receipt-count 100 --batch-size 10 --seed run-2 \
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

To verify one receipt's inclusion in an anchored batch without a password or transaction:

```bash
BATCH_ANCHOR_ADDRESS=0xE680eEb44688898c108FAf2bF8589d108Fe86fE8 \
  bash ./scripts/verify-batch-membership.sh \
  /opt/aichain/devnet/benchmark-100x100-run-2.json \
  0 42
```

The command constructs the receipt's Merkle proof from the deterministic manifest and calls the contract's pure `verifyMembership` method. The off-chain manifest remains necessary to distribute receipt IDs and proofs; anchoring a root alone does not provide batch data availability.

## 6. Initial Baseline: 100 Receipts in 10 Batches

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Private single-node serial confirmed baseline; not P2P or public-network capacity |
| Batch anchor | `0xE680eEb44688898c108FAf2bF8589d108Fe86fE8` |
| Batch deployment transaction | `0x5a9b0733f06c6ccaf024f96a99fabda22d61c2d3b31780362b35145c300cc303` |
| Workload | 100 synthetic receipts, 10 batches, 10 leaves per batch |
| End-to-end elapsed time | 180.268 seconds, including local root construction and serial confirmation waits |
| End-to-end transaction TPS | 0.05547 |
| End-to-end logical receipt TPS | 0.55473 |
| Batch gas used | 92,831 per batch; 9,283.1 gas per logical receipt |

This is a preliminary baseline, not a target or a consensus limit. The run is intentionally serial, uses a temporary low-difficulty one-node Ethash development chain, and includes client-side root construction. The benchmark runner now separately reports root-construction time and serial confirmation-only TPS for subsequent runs.

## 7. Second Baseline: 100 Receipts in One Batch

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Private single-node serial confirmed baseline; not P2P or public-network capacity |
| Workload | 100 synthetic receipts, 1 batch, 100 leaves |
| Batch root construction | 1.839 seconds |
| Confirmed submission time | 52.266 seconds |
| End-to-end transaction TPS | 0.01845 |
| End-to-end logical receipt TPS | 1.84549 |
| Serial confirmation-only transaction TPS | 0.01913 |
| Serial confirmation-only logical receipt TPS | 1.91330 |
| Batch gas used | 92,831; 928.31 gas per logical receipt |
| Batch transaction | `0x9c9e8cfc8749d35cabe1b14d6d8b2ffdc89c044445000d4e9fb8644f7c88c03c` |

The one-batch run waited 52.266 seconds for a block, versus the earlier run's varying per-batch confirmation times. PoW block discovery is probabilistic, so a one-transaction sample is too small to estimate confirmation latency or TPS reliably. The strong comparable result is gas efficiency: the same 92,831-gas anchor represented 100 receipts rather than 10, reducing gas per logical receipt from 9,283.1 to 928.31.

This demonstrates the value of batching but not a production-ready throughput level. Future capacity claims require repeated seeded workloads, concurrent submission tests, controlled block parameters, multi-node propagation, and data-availability/inclusion-proof measurements.

### 7.1 Concurrent Broadcast Benchmark

The concurrent runner pre-computes roots, obtains the pending account nonce, broadcasts each batch with an explicit sequential nonce and `cast send --async`, then waits for receipts after all transactions are in the pool. It reports broadcast TPS separately from the time until all batches confirm.

```bash
BATCH_ANCHOR_ADDRESS=0xE680eEb44688898c108FAf2bF8589d108Fe86fE8 \
  bash ./scripts/benchmark-batch-anchor-concurrent.sh \
  /opt/aichain/devnet/benchmark-1000x100-concurrent.json \
  /opt/aichain/devnet/benchmark-1000x100-concurrent-report.json
```

The manifest must use a fresh seed so its roots do not collide with earlier anchors. Broadcast TPS measures RPC/mempool ingestion from one sender; it is not consensus throughput. The all-confirmed metric measures the current one-node development chain's ability to include the queued batch transactions.

## 8. Third Baseline: 1,000 Receipts in 10 Batches

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Private single-node serial confirmed baseline; not P2P or public-network capacity |
| Workload | 1,000 synthetic receipts, 10 batches, 100 leaves per batch |
| Root construction time | 25.730 seconds total; approximately 2.573 seconds per batch |
| Confirmed submission time | 122.775 seconds total |
| End-to-end transaction TPS | 0.06700 |
| End-to-end logical receipt TPS | 6.70009 |
| Serial confirmation-only transaction TPS | 0.08145 |
| Serial confirmation-only logical receipt TPS | 8.14498 |
| Batch gas used | 92,819–92,831; approximately 928.3 gas per logical receipt |
| Confirmation range | 2.342–48.735 seconds per serial batch |

The repeated workload makes the distinction between batching efficiency and PoW confirmation variance clearer. Each batch had near-constant gas cost and represented 100 receipts, while confirmation latency varied widely because the temporary one-miner PoW chain is probabilistic and untuned. The next capacity experiment must submit batches concurrently into the transaction pool, then measure acceptance, block packing, queueing, and confirmation distribution separately.

## 9. Fourth Baseline: Concurrent Broadcast of 1,000 Receipts

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Private one-node concurrent broadcast baseline; not P2P or public-network capacity |
| Workload | 1,000 synthetic receipts, 10 batches, 100 leaves per batch |
| Root construction | 23.930 seconds before broadcast |
| Broadcast time | 9.127 seconds |
| Broadcast transaction TPS | 1.09562 |
| Broadcast logical receipt TPS | 109.56234 |
| Time from broadcast start until all receipts confirmed | 37.852 seconds |
| All-confirmed transaction TPS | 0.26419 |
| All-confirmed logical receipt TPS | 26.41884 |
| Block packing | All 10 batch transactions / 1,000 receipts included in block `15162` |
| Batch gas used | 92,807–92,831; approximately 928.3 gas per logical receipt |

The pending pool accepted the sequential-nonce broadcasts, and the miner packed every batch into one block. Therefore the transaction pool and block gas capacity did not constrain this workload. The confirmation interval remains governed by the temporary one-miner Ethash block-discovery time. These figures must not be described as decentralized-network TPS until the same test passes under multi-node P2P conditions with explicit finality/confirmation policy.

### 9.1 Two-Node Replication Check

After a concurrent benchmark confirms through Node 1, verify that every benchmark transaction is visible with matching confirmed receipt data through Node 2's separate localhost RPC endpoint:

```bash
cd /opt/aichain
python3 ./scripts/verify-benchmark-replication.py \
  /opt/aichain/devnet/benchmark-1000x100-two-node-report.json
```

The check first requires equal current block heights, then compares each report transaction's hash, block number, block hash, and successful status between `127.0.0.1:8545` (Node 1) and `127.0.0.1:8546` (Node 2). It validates P2P replication of the confirmed benchmark data. It does **not** measure independent-host propagation latency, validator/miner diversity, finality, or public-network TPS because both nodes run on the same VPS and Node 1 is the only miner.

### 9.2 First Two-Node Same-VPS Run

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Two peered nodes on one VPS; Node 1 mines and Node 2 is non-mining |
| Workload | 1,000 synthetic receipts, 10 concurrent batches, 100 leaves per batch |
| Fresh workload namespace | `two-node-run-1-20260820` |
| Broadcast transaction TPS | 0.89889 |
| Broadcast logical receipt TPS | 89.88947 |
| All-confirmed transaction TPS | 0.29921 |
| All-confirmed logical receipt TPS | 29.92134 |
| Replication verification | All 10 confirmed batch transactions matched on Node 1 and Node 2 at shared block `15507` |

This is the first successful replication-aware capacity run. The confirmed logical rate is close to the earlier one-node result (26.41884 logical receipts/sec); the difference is compatible with temporary PoW block-timing variation and must not be attributed to the second node. The test establishes that the non-mining peer receives the confirmed workload, not that the network has two independent fault domains or that it can sustain this rate on external hardware.

### 9.3 Non-Mining Peer Submission Test

To test application ingress through a non-mining peer, use a fresh one-batch manifest and send the signed transaction to Node 2's localhost RPC endpoint. Node 2 must relay it to Node 1 for mining; the runner then obtains its confirmed receipt through Node 2.

```bash
RPC_URL=http://127.0.0.1:8546 \
BENCHMARK_SCOPE='same-VPS non-mining Node 2 submission and Node 1 mining relay test; not public-network TPS' \
BATCH_ANCHOR_ADDRESS=0xE680eEb44688898c108FAf2bF8589d108Fe86fE8 \
  bash ./scripts/benchmark-batch-anchor-concurrent.sh \
  /opt/aichain/devnet/benchmark-node-2-relay.json \
  /opt/aichain/devnet/benchmark-node-2-relay-report.json

python3 ./scripts/verify-benchmark-replication.py \
  /opt/aichain/devnet/benchmark-node-2-relay-report.json
```

The signer may use the existing development keystore because it signs locally; it does not imply that Node 2 owns the account. A successful run proves the expected temporary path `client → Node 2 → P2P relay → Node 1 miner → both nodes`. It does not measure external-peer latency or validate a production transaction-ingress architecture.

### 9.4 First Non-Mining Peer Relay Result

| Field | Result |
|---|---|
| Date | 2026-08-20 |
| Network scope | Same-VPS non-mining Node 2 submission and Node 1 mining relay |
| Workload | 100 synthetic receipts in one 100-leaf batch |
| Fresh workload namespace | `node-2-relay-1-20260820` |
| Batch transaction | `0x78aa8ae9a4d3e99c2db36ba5b8433a5e09335390ffabe0d232242c7d75785e1b` |
| Confirmed block | `15522` |
| Broadcast logical receipt TPS | 116.10215 |
| All-confirmed logical receipt TPS | 3.81818 |
| Replication verification | The confirmed transaction matched on both nodes at shared height `15525` |

The transaction entered through Node 2's RPC, received a confirmed receipt through Node 2, and was independently found through Node 1. This validates the devnet relay path. The one-batch all-confirmed rate is dominated by a 26.19-second PoW confirmation wait and is therefore not a capacity estimate or suitable for comparison with the 10-batch runs.

## 10. Open Decisions

| ID | Decision | Status |
|---|---|---|
| SCALE-001 | Production receipt batching, aggregation, recursion, and throughput strategy | TBD |
| SCALE-002 | Workload, confirmation, and capacity targets | TBD |
| SCALE-003 | Batch data availability, inclusion-proof distribution, retry, and audit model | TBD |
| SCALE-004 | Whether batching is contract-level, native protocol, rollup-based, or hybrid | TBD |

## 11. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-20 | Initial batch-anchor capacity prototype |
| 0.2 | 2026-08-20 | Recorded initial 100-receipt serial baseline and improved metric separation |
| 0.3 | 2026-08-20 | Recorded 100-receipt single-batch baseline and PoW variance interpretation |
| 0.4 | 2026-08-20 | Recorded 1,000-receipt repeated batch baseline |
| 0.5 | 2026-08-20 | Recorded concurrent 1,000-receipt block-packing baseline |
| 0.6 | 2026-08-20 | Added two-node benchmark-replication verification workflow |
| 0.7 | 2026-08-20 | Recorded first replicated two-node same-VPS concurrent benchmark |
| 0.8 | 2026-08-20 | Added non-mining Node 2 transaction-submission and relay test workflow |
| 0.9 | 2026-08-20 | Recorded first successful non-mining peer transaction relay result |
