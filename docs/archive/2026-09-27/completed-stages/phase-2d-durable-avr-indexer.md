# Phase 2D Durable AVR Event Indexer

> Historical archive — 27 September 2026. Retained for its original scope, not current launch guidance. See the [active documentation](C:/AIChain/docs/README.md).

> Historical experiment / scope notice: measurements and protocol contracts retain their dated scope. Own-chain mining requirements are not current Base launch gates. Read [current platform state](../../../platform-architecture.md) and [active roadmap](../../../roadmap-and-decisions.md).

| Field | Value |
|---|---|
| Status | Base Sepolia worker installed on the VPS; initial catch-up and live resume passed |
| State schema | `aichain.avr-event-index` / `0.1.0-draft` |
| Manifest schema | `aichain.avr-batch-manifest` / `0.1.0-draft` |
| Transport | Local JSON-RPC or explicit Base Sepolia read-only worker |
| Last updated | 2026-09-23 |

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

The Base Sepolia worker scans the configured deployment history in ranges of at
most 1,000 blocks to respect the public RPC's event-range limit. It fetches
logs for the configured anchor contract, checks each emitted event against its
block, reads the range-end block before and after the log query to detect a
moving chain, and atomically persists the completed range before advancing.
Each checkpoint stores a range end block hash. Because a block hash commits to
its parent history, the newest matching checkpoint establishes that earlier
indexed ranges remain on the same chain. If the checkpoint changed, the worker
clears derived entries and rebuilds from the configured start block so
receipt/batch-key overwrites cannot leave orphaned values behind. A sync result
explicitly reports `reorged: true` when this occurred.

The current alpha keeps one checkpoint per completed range in an atomically
replaced JSON state file. This survives process restarts and permits full
rebuild from the chain, but it is not a production database or backup policy.
Snapshots, compaction, multi-process storage, controlled deep-reorg recovery
and restore procedures remain open work.

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

One Base Sepolia scan, starting at the deployed anchor contract's creation
block (resolved and checked from the deployment transaction):

```powershell
$env:AICHAIN_ENABLE_AVR_INDEXER = '1'
npm run base:avr-index -- `
  --state .\build\base-sepolia\avr-event-index.json `
  --manifests-dir .\build\base-sepolia\synthetic-manifests `
  --watch-seconds 15
```

Omit `--watch-seconds` for a single catch-up run.

The worker defaults to Base's public Sepolia RPC and the PublicNode Sepolia
endpoint, checks chain ID `84532` and the deployed anchor bytecode, and
retries another healthy endpoint when a request fails. It only reads chain
data. Both public endpoints are rate limited and intended for development;
use an independently provisioned provider for sustained or production
indexing. Add `--watch-seconds 15` to keep syncing, with bounded retry backoff
on errors. Add `--rpc-url https://...` (repeatable, at most three endpoints)
to use operator-provided HTTPS endpoints. `--start-block N` explicitly creates
a partial-history index and should only be used when that boundary is intended.
Only one process may own a state file; an exclusive lock prevents concurrent
writers. A stale `.lock` file must only be removed after confirming its process
is no longer running.

The worker saves state under `build/`, which is generated and ignored. Preserve
that file and its backup if you want restart continuity; the chain can rebuild
it if it is lost. This indexer has no public query API yet. The local AVR RPC
sidecar can expose entries only on loopback through
`aichain_getAvrIndexEntry` when started with `--index-state <state.json>`.

## Disposable integration evidence

### Base Sepolia live catch-up — 2026-09-23

The read-only Base Sepolia worker was run against both configured public RPC
endpoints. It verified chain ID `84532`, the deployed anchor bytecode and the
contract creation transaction, then indexed 127,891 blocks from deployment
block `47,085,379` through block `47,213,269`. It found nine V2 batch events;
all five previously recorded acceptance transactions were present. The
synthetic sample manifest attached to its canonical anchor and receipt lookup
returned the expected one-leaf batch inclusion record.

A second invocation resumed at the saved cursor, indexed only 62 new blocks
through `47,213,331`, and reported `reorged: false`. This confirms persisted
resume behavior across separate process runs. The scan used shared public
testnet RPCs and is a development integration result, not a production uptime,
finality, or reorg-depth guarantee.

### Disposable local-node recovery

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

## Remaining gates

- Alerting/dashboard for cursor lag, RPC failure and repeated rebuilds. The
  worker itself includes bounded retry and backoff; systemd restarts failures.
- Sustained VPS soak and provider-rate-limit observation. The initial catch-up
  and short live-resume interval passed using public Base Sepolia RPCs; these
  shared endpoints are not a production provider commitment.
- Authenticated index-query API and connection from the website dashboard.
- Private manifest storage and controlled attachment so a receipt lookup can
  produce a batch inclusion proof without exposing the mapping to unauthorised
  callers.
- Database, schema migration, compaction and backup design.
- Deep-reorg/snapshot recovery and controlled reset procedures.
- Manifest retention, authorised access and deletion policy.
- Pagination, caching, rate limits and multi-tenant authorisation.
- Blockscout integration and receipt/proof display.
- Load, DoS, privacy and independent security review before public exposure.
