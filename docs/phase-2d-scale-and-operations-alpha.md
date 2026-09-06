# Phase 2D Scale and Operations Alpha

| Field | Value |
|---|---|
| Status | Alpha reference controls and measurements complete |
| Scope | Local acceptance, batching, indexer and explorer boundary |
| Production capacity claim | None |
| Last updated | 2026-09-06 |

## Alpha ingress policy

| Control | Alpha value | Why |
|---|---:|---|
| Acceptance state | Immediate local validation | Gives agents an explicit provisional response before chain inclusion |
| Micro-batch window | 250 ms | Limits latency while allowing short bursts to coalesce |
| Maximum batch | 1,000 receipt IDs | Matches the largest controlled G3 batch measurement; not a final protocol maximum |
| Maximum in-memory queue | 10,000 receipts | Bounded backpressure; callers receive `rejected-queue-full` rather than unbounded memory use |
| Duplicate key | Canonical receipt ID | Repeated submissions return the existing state without another queue entry |
| Retry budget | 3 attempts | Retryable submission failures and detected reorgs re-enter the queue only inside this budget |
| Initial confirmation display | `provisionally-included` | One block is not finality; risk-specific confirmation policy remains TBD |

The reference queue never handles raw AI data, keys, signatures, proof bytes or
transactions. It creates opaque batch manifests; a separate signing/submission
worker must use standard Ethereum transaction flow and record the result.

## Fee and confirmation posture

No AIChain-specific fee schedule is selected. Alpha uses ordinary EVM gas
estimation and transaction-fee policy. The product must display estimated gas,
batch cost allocation and the selected confirmation threshold rather than imply
that a gateway acceptance is a settled chain result.

For low-risk agent workflows, a product may show one-block inclusion as
provisional. Higher-impact actions should wait for a configured number of
confirmations. The final number depends on multi-miner stale/reorg evidence and
is a closed/public-testnet decision, not an SDK constant.

## Measured evidence

| Layer / workload | Result | Interpretation |
|---|---:|---|
| Local SDK synthetic acceptance, 10,000 receipts | 17,425.62 logical receipts/s; 40 batches; 573.87 ms | CPU-only local queue/manifest construction; excludes signing, RPC, mining and confirmation |
| Three-machine 10-second chain, batch size 100 | 80.51 confirmed logical receipts/s | Controlled development chain result |
| Isolated G3 batch size 1,000 | 217.66 confirmed logical receipts/s; 1,257.93 broadcast logical receipts/s | Controlled one-GPU development result, not public capacity |
| Three-peer cross-host batch run | 34.53 all-confirmed logical receipts/s | Small private replication test, not independent network capacity |

The chain results are retained in [ASERT validation](./phase-2a-asert-live-validation.md)
and [G3 validation](./phase-2a-g3-network-validation.md). The lower cross-host
result is the more useful caution: high-volume product planning must use
backpressure and batching rather than extrapolating the best one-node run.

## Indexer and explorer surface

The durable indexer exposes receipt-to-anchor lookup, including batch manifest
and sorted-Merkle inclusion evidence. The local AVR RPC adds
`aichain_getAvrExplorerEntry`, which renders a commitment-only explorer view
with optional loopback Blockscout transaction/block/address links. It does not
modify Blockscout, expose its UI, or reveal raw AI evidence.

## Phase 2D alpha exit and deferred gates

Phase 2D alpha is complete: canonical presentation, assurance levels, proof
references, local RPC, durable event indexing, reorg rollback, batch inclusion,
bounded ingress policy, measured local acceptance, and explorer-safe lookup are
implemented.

Before public use, the following remain mandatory: a real persistent queue and
database, signer/submission worker, long-duration multi-host load and recovery
tests, measured RPC/indexer p50/p95 latency, resource and state-growth metrics,
rate limiting/authentication, data-availability policy, Blockscout deployment
integration, and independent security review.
