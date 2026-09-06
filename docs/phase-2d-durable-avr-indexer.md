# Phase 2D Durable AVR Event Indexer

| Field | Value |
|---|---|
| Status | Development alpha implemented and disposable-node tested |
| State schema | `aichain.avr-event-index` / `0.1.0-draft` |
| Manifest schema | `aichain.avr-batch-manifest` / `0.1.0-draft` |
| Transport | Standard loopback Ethereum JSON-RPC only |
| Last updated | 2026-09-06 |

## What it does

The event indexer derives a local, disposable query index from canonical
`ReceiptAnchored`, `AuthorisedReceiptAnchored`, and `ReceiptBatchAnchored`
events. The chain remains the source of truth. The index is only a recoverable
performance and lookup layer.

Its JSON state records the chain ID, next block cursor, canonical block-hash
checkpoints, individual receipt anchors, batch anchors, and attached validated
manifests. State writes use a temporary file plus rename so readers do not see a
partially written file.

## Cursor and reorganisation behaviour

Before every sync, each stored checkpoint is checked against the node. If a
block hash differs, entries at that height and later are removed, the cursor
rewinds, and canonical logs are scanned again. A sync result explicitly reports
`reorged: true` when this occurred.

The current alpha retains every checkpoint it indexed. This is intentionally
simple and safe for development but is not a production storage policy. Pruned
checkpoint windows, deep-reorg recovery, durable database choice, snapshots and
compaction are open design work.

## Batch manifests and lookup

A manifest contains opaque receipt IDs, count, computed sorted-Keccak root, and
the anchor schema version. It is attached only when an indexed canonical batch
event has the same root, leaf count and schema version. A receipt lookup returns:

- the individual anchor, or
- a batch anchor plus a receipt-specific sorted-Merkle sibling proof.

The manifest is not raw AI evidence. It still has a privacy cost because it
reveals receipt IDs; applications must choose their data-availability and
disclosure policy before sharing manifests outside their authorised boundary.

## Operation

One explicit local sync:

```powershell
$env:AICHAIN_ENABLE_AVR_INDEXER = '1'
npm run avr:index -- `
  --state .\devnet\avr-index\state.json `
  --contract individual:0xYOUR_AVR_ANCHOR `
  --contract batch:0xYOUR_BATCH_ANCHOR `
  --manifests-dir .\devnet\avr-manifests `
  --ethereum-rpc http://127.0.0.1:8545 `
  --start-block 0
```

The command rejects non-loopback Ethereum RPC URLs and refuses execution unless
the explicit opt-in flag is present. The local AVR RPC sidecar can expose the
derived entry through `aichain_getAvrIndexEntry` when started with
`--index-state <state.json>`.

## Disposable integration evidence

A fresh Core-Geth `--dev` node was started under a new VPS `/tmp` directory,
with HTTP JSON-RPC bound solely to `127.0.0.1:18547`. The existing `/opt/aichain`
development network was not changed.

The indexer ran locally through an authenticated SSH tunnel to that loopback
endpoint:

- Initial individual-anchor scan: 115 blocks, persisted through block 164;
- Incremental resume: 31 new blocks, advancing the saved cursor to 196;
- Actual `ReceiptAnchored` event: block 57, with the indexed opaque receipt ID,
  commitments root, issuer, schema version and transaction hash matching the
  node log;
- Actual `ReceiptBatchAnchored` event: block 248, root and count matched a
  three-receipt manifest; lookup returned the two sibling hashes required for
  inclusion of the selected receipt.

The unit suite additionally simulates a replaced canonical block hash and
proves that orphaned receipt entries are removed before the replacement block
is rescanned. No production finality or long-range reorganisation claim follows
from this short disposable test.

## Open gates

- Long-running indexer supervision, metrics, retry and backoff policy.
- Database, schema migration, compaction and backup design.
- Deep-reorg/snapshot recovery and controlled reset procedures.
- Manifest availability, authenticated access and retention policy.
- Pagination, caching, rate limits and multi-tenant authorisation.
- Blockscout integration and receipt/proof display.
- Load, DoS, privacy and independent security review before public exposure.
