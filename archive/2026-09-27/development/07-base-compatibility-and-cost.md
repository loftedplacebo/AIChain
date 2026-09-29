# Base compatibility checks and high-volume ETH cost estimate

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Current baseline — 27 September 2026: [Platform current state](C:/AIChain/docs/platform-architecture.md) supersedes dated implementation and launch-status statements below. The governance workspace uses the private VPS API, sponsored Base Sepolia batches and live evidence verification. The 24-hour reliability run is in progress. Production identity, operations, automatic alerting and commercial release remain gated. Historical measurements and protocol semantics retain their original scope.

20 September 2026 · Read-only investigation · Not a deployment or production compatibility sign-off

## Conclusion

The existing receipt-batch anchoring path is a strong compatibility candidate for Base. Its Solidity 0.8.24 contract, Istanbul EVM compilation target, standard Keccak hashing, storage and events do not depend on KawPoW or custom AIChain consensus. This does not establish compatibility of every optional identity, proof or ZK component.

At the previously modelled 100 million events/day and 1,000 events per full batch, the sampled-fee estimate is **0.0558 ETH/day or 1.674 ETH per 30 days** for anchoring. This combines live Base fee-oracle inputs with historical private-chain execution gas. It is not a deployed Base measurement or guaranteed monthly price.

## Evidence and outstanding checks

Inspected: [compiler settings](C:/AIChain/contracts/avr-anchor/foundry.toml), [batch contract](C:/AIChain/contracts/avr-anchor/src/ReceiptBatchAnchor.sol), [anchor verifier](C:/AIChain/sdk/typescript/avr-anchor-verifier.js), and [historical gas benchmark](C:/AIChain/docs/capacity-and-batching-prototype.md).

| Check | Current evidence | Required confirmation |
|---|---|---|
| Contract execution | Standard Solidity/EVM; no custom consensus hook in batch anchor | Reproducible compile, Base-aware local/fork execution and Base Sepolia deployment; compare bytecode, logs and gas |
| Receipt identity | Existing receipt binds chain ID and contract | New receipts signed for the exact Base destination; old AIChain receipts remain unchanged |
| Customer author versus gas payer | Batch path supports distinct receipt author and submitter in the wider design | End-to-end test with separate keys; reject false issuer claims and mismatched destinations |
| Batch semantics | Sorted Keccak membership proofs and opaque receipt IDs | Live 1,000-leaf batch, export and independent verification, corrupted-proof rejection |
| Public contract behaviour | Global root reservation permits first-writer interference | Resolve ownership/idempotency design, review and test adversarial submissions before production |
| Finality | Current verifier checks canonical block and confirmation depth | Base-specific provisional/data-final policy, observed block references, reorg handling and RPC disagreement tests |
| Evidence availability | Receipts and proofs can be packaged | Auditor reconstructs a workflow with our API offline; test retention, openings and authorised access |
| Full verification feature set | Anchor compatibility only | Inventory each required authority registry, cryptographic precompile and ZK verifier/circuit; test separately; include added gas if executed on-chain |
| Production throughput | Planning arithmetic, not load proof | Sustained ingest/batch/broadcast/observe/recovery tests with quotas, nonce management, RPC limits and storage sizing |

Base documents standard EVM contract compatibility and Base-specific tooling for its native precompiles. Our minimal anchor does not call those extensions, but the selected testing environment must match the production target. [Base smart contracts](https://docs.base.org/specifications/reference/smart-contracts)

The next empirical step needs a dedicated Base Sepolia test deployer funded with test ETH, a selected RPC connection and an agreed receipt/contract version. Use local secure key storage; no private keys should be pasted into chat. No production ETH or customer evidence is needed for the compatibility exercise. A production decision additionally needs a retention policy, service targets and operating budget.

## Reproducible read-only fee sample

Run [the sampling script](../../../development/tools/estimate-base-anchor.cjs), which uses the locally installed ethers library and public Base RPC. It contains no private key or broadcast method. Output is saved in [the sample JSON](../../../development/review/base-anchor-fee-sample.json).

- Sample time: 2026-09-20 17:19:41 UTC.
- Network: Base mainnet, chain ID 8453; oracle calls pinned to block 51,567,717.
- RPC gas-price suggestion: 6,000,000 wei/gas = 0.006 gwei/gas. This is a short-lived price suggestion, not an inclusion guarantee.
- Execution gas assumption: 92,831, from the historical private-chain benchmark; not current Base `estimateGas`.
- Synthetic call: `anchorBatch(bytes32,uint64,string)`, 1,000 leaves and `0.4.0-alpha`; 164 bytes calldata.
- Synthetic unsigned transaction: 208 bytes, with a placeholder destination and nonce. No contract was deployed or transaction submitted.
- Oracle `getL1Fee`: 1,063,911,842 wei for the synthetic serialized input.
- Oracle size upper bound: 2,632,891,724 wei using unsigned length plus a conservative 65-byte allowance. This is a current-state size bound, not a future market-fee ceiling.

Base charges execution plus Ethereum publication fees. Read-only fee estimates must include both. Actual destination bytes, nonce, gas fields, schema length, protocol settings and execution results may change the result. [Base network fees](https://docs.base.org/specifications/transactions/network-fees)

```text
100,000,000 events/day ÷ 1,000 events/batch = 100,000 anchors/day
100,000 anchors/day × 30 = 3,000,000 anchors/month

execution/anchor = 92,831 × 6,000,000 wei = 556,986,000,000 wei
publication/anchor = 1,063,911,842 wei (sampled estimate)
total/anchor = 558,049,911,842 wei = 0.000000558049911842 ETH

daily total = 0.0558049911842 ETH
30-day total = 1.674149735526 ETH
```

Using the oracle size upper-bound component gives approximately 1.679 ETH/month at the same execution assumptions. Similar totals here mean publication fees happened to be small in this snapshot; do not generalise that to future fee conditions.

| Sensitivity | ETH/day | ETH/30 days |
|---|---:|---:|
| Sample-based model | 0.0558 | 1.674 |
| Sample model plus 20% contingency | 0.0670 | 2.009 |
| 10× complete per-anchor fee | 0.5580 | 16.741 |
| 100× complete per-anchor fee | 5.5805 | 167.415 |

The multipliers are scenarios, not forecasts or guaranteed limits. The 20% line is arithmetic contingency, not evidence that it covers congestion. A gas-limit or max-fee setting reserves spending capacity; actual gas used and effective price determine the execution charge.

## Scope of the high-volume assumption

At steady aggregate intake, 100 million/day is about 1,157 events/second. A shared 1,000-event batch fills in about 0.86 seconds, so it fits the previously proposed ten-second batching wait. Separate tenant queues, urgent flushes, uneven arrivals, individual submissions, contract hardening and extra proof-verification calls can increase transaction volume or gas. For example, at the same workload but 100 events per batch, anchors and approximately anchor fees increase tenfold.

This is a hypothetical high-volume scenario, not a hard upper limit on throughput or expenditure. It covers root anchoring only, excluding initial deployment, API servers, RPC service, indexing, evidence storage/replication/egress, key custody, monitoring, support and any on-chain ZK proof verification. At the earlier illustrative 2 KB/event, raw evidence is 200 GB/day, or 6 TB per 30 days, before replication and indexes. At 20 KB/event, that becomes 60 TB/month.

Compatibility sign-off must use the actual final contract and required feature set. Operational sign-off must additionally establish accurate finality, durability, independent export and measured unit costs. The [settlement architecture decision](../business/13-settlement-architecture-decision.md) remains the governing proposal.
