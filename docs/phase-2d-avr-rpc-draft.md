# Phase 2D Local AVR JSON-RPC Draft

| Field | Value |
|---|---|
| Status | Development-only reference service |
| RPC schema | `aichain.avr-rpc` / `0.1.0-draft` |
| Transport | HTTP on `127.0.0.1` only |
| Enablement | Explicit `AICHAIN_ENABLE_AVR_RPC=1` required |
| Relationship to Core-Geth | Separate sidecar; no Core-Geth module registered in this milestone |
| Last updated | 2026-09-06 |

## Purpose and boundary

This first testable AIChain RPC surface deliberately sits beside the node,
rather than changing Core-Geth's standard JSON-RPC namespaces. It validates AVR
lookup and verification semantics before deciding whether a node-integrated API
is justified.

The service cannot proxy `eth_*`, `net_*`, `web3_*`, personal, admin, mining,
or arbitrary methods. Clients continue to use the node's ordinary Ethereum RPC
endpoint for those methods. The sidecar only reads canonical AVR presentation
files and, when asked, reads a standard Ethereum transaction receipt from the
configured local node.

It is not an ingestion endpoint, wallet, key store, proof generator, or raw-AI
data store. It accepts no raw prompts, outputs, credentials, proof bytes, or
transactions.

## Startup

Prepare a directory containing only validated AVR Presentation `0.3.0-alpha`
JSON files, then start explicitly:

```powershell
$env:AICHAIN_ENABLE_AVR_RPC = '1'
node .\sdk\typescript\avr-rpc-server.js `
  --presentations-dir .\devnet\avr-presentations `
  --ethereum-rpc http://127.0.0.1:8545 `
  --port 18645
```

The service always binds to `127.0.0.1`; there is no `--host` option. It
refuses startup if the environment flag is absent. A remote developer must use
an authenticated SSH tunnel to the loopback endpoint. It must not be publicly
reverse-proxied or added to firewall rules.

## Methods

| Method | Parameters | Result | Notes |
|---|---|---|---|
| `aichain_avrRpcInfo` | `[]` | Version, methods and static limits | Read-only |
| `aichain_getAvrPresentation` | `[receiptId]` | Indexed presentation | `receiptId` is bytes32 |
| `aichain_getAvrSummary` | `[receiptId]` | Assurance summary | Does not establish anchor validity |
| `aichain_verifyAvrAnchor` | `[receiptId, minimumConfirmations?]` | Anchor verification | Confirmation range: 1–256 |

Unknown or standard methods return `-32601`; malformed parameters return
`-32602`; an absent indexed receipt returns `-32004`.

## Index model

At startup the sidecar reads up to 1,024 JSON presentation files, each at most
1 MiB, validates their canonical receipt binding, and makes an in-memory index
keyed by lower-case receipt ID. It does not scan blocks, persist a database,
follow reorgs, or infer a receipt from an arbitrary transaction.

This is an **indexer-facing lookup reference**, not a production indexer. The
next package must add durable event cursors, block-hash checkpoints and reorg
rollback, contract/profile ABI versioning, batch manifest/inclusion retrieval,
bounded caching/pagination/rate limits, and a disclosure-storage privacy policy.

## Verification and release gates

Anchor verification uses ordinary local Ethereum RPC. It checks chain ID,
transaction success, confirmations, the expected contract event and receipt
bindings. A batch requires a sorted-Merkle inclusion proof: the batch event
alone is insufficient.

The listener is loopback-only, requires explicit enablement, has a 1 MiB request
limit and a four-method read-only allow-list. No public endpoint, Core-Geth
integration, authentication model, database, or production availability claim
is approved by this draft. Node integration requires API, DoS, reorg,
authentication and independent security review.
