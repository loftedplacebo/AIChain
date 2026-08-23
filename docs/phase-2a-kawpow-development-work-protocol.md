# Phase 2A KawPoW Development Work Protocol

| Field | Value |
|---|---|
| Status | Registry, strict codec, and unregistered service implemented; node integration pending |
| Version | 0.3 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0004](./decisions/0004-kawpow-phase-2a-development-selection.md) |
| Production status | **TBD — this is not a public mining API or launch protocol** |

## Purpose

Define the smallest safe boundary for testing a GPU miner against a disposable
KawPoW development node. The node constructs the candidate block and consensus
target. A miner receives immutable work and returns only a nonce and mix
digest. The node remains authoritative and independently verifies every
submission on CPU.

This protocol does not register KawPoW for normal Core-Geth networks, replace
Ethash on the shared devnet, or alter standard Ethereum JSON-RPC.

## Exposure Boundary

- Use a separate `aichain` RPC namespace.
- Keep the service disabled unless an explicit development-only startup flag
  is supplied. The exact flag name is an implementation detail until reviewed.
- Expose it through IPC by default when enabled. HTTP exposure must bind to
  `127.0.0.1` and require the `aichain` module to be explicitly allowed.
- Remote use must travel through an authenticated SSH tunnel. Do not expose the
  endpoint on a public interface.
- Do not accept wallet keys, pool credentials, arbitrary block templates, or
  caller-supplied targets.

## Proposed Methods

The names are versioned development API names, not permanent public RPC
commitments.

### `aichain_getKawpowWork`

Parameters: none.

Result:

```json
{
  "version": "0.1.0-dev",
  "workId": "0x<32 bytes>",
  "headerHash": "0x<32 bytes>",
  "parentHash": "0x<32 bytes>",
  "height": "0x2a",
  "target": "0x<32 bytes>",
  "expiresAt": "0x66c9f900"
}
```

### `aichain_submitKawpowWork`

Parameters: one object.

```json
{
  "version": "0.1.0-dev",
  "workId": "0x<32 bytes>",
  "nonce": "0x<8 bytes>",
  "mixDigest": "0x<32 bytes>"
}
```

Result:

```json
{
  "accepted": true,
  "status": "accepted",
  "blockHash": "0x<32 bytes>"
}
```

For a rejected submission, `accepted` is `false`, `blockHash` is omitted, and
`status` is one of `stale`, `duplicate`, `malformed`, `wrong-version`, or
`invalid-seal`. Detailed internal verification errors must stay in local node
logs rather than becoming a remote oracle.

## Canonical Encoding

| Field | Encoding |
|---|---|
| `version` | Exact ASCII string `0.1.0-dev` |
| `workId` | `0x` plus exactly 64 lowercase hexadecimal digits |
| `headerHash` | Core-Geth pre-seal header hash; `0x` plus exactly 64 lowercase hexadecimal digits |
| `parentHash` | `0x` plus exactly 64 lowercase hexadecimal digits |
| `height` | Canonical Ethereum JSON quantity; no leading zeroes |
| `target` | Unsigned 256-bit big-endian value; `0x` plus exactly 64 lowercase hexadecimal digits |
| `expiresAt` | Unix seconds as a canonical Ethereum JSON quantity; scheduling hint only |
| `nonce` | Eight bytes in the existing EVM header nonce byte order; `0x` plus exactly 16 lowercase hexadecimal digits |
| `mixDigest` | `0x` plus exactly 64 lowercase hexadecimal digits |

`workId` is a node-local opaque identifier. Its derivation must be deterministic
for one issued template and domain-separated from consensus hashes, but it is
not a consensus field and miners must not derive meaning from it.

## Node State Rules

1. The node issues work only for its current canonical head and its own block
   template, height, difficulty, and target.
2. Any canonical-head change invalidates all work for the previous parent.
3. Expiry invalidates work operationally; `expiresAt` does not change consensus
   validity.
4. A `workId` may produce at most one accepted block. Replays are duplicates.
5. Submission never replaces the issued header, height, difficulty, target,
   transactions, timestamp, or parent.
6. Before import, the node reconstructs the header, checks that the parent is
   still canonical, and runs the normal KawPoW engine header and seal checks.
7. A GPU is never required for validation, synchronization, or block import.

## Resource Limits

- Maximum JSON request body: 4 KiB.
- Maximum active work records: 64; evict expired and oldest records first.
- Default work lifetime: 60 seconds; development configurable within 10–300
  seconds.
- Per-client submission limit: 20 per second with a burst of 40.
- `getKawpowWork` limit: 2 per second with a burst of 4.
- Reject unknown object fields and all non-canonical encodings.
- Never perform unbounded allocation or launch concurrent verification without
  a fixed worker limit.

These are defensive development defaults, not production capacity decisions.

## Required Test Vectors

- valid issued work accepted once;
- same solution rejected as duplicate;
- work rejected after a canonical-head change;
- expired work rejected;
- unknown and wrong-version work rejected;
- short, long, uppercase, missing-prefix, leading-zero, and non-hex fields
  rejected;
- tampered nonce and mix digest rejected;
- valid seal paired with another `workId`, header, height, or target rejected;
- caller cannot submit a target, difficulty, height, header, or transaction
  list;
- request-size, rate, active-work, and verifier-worker limits enforced; and
- standard Ethereum JSON-RPC regression suite unchanged when the service is
  disabled and when it is locally enabled.

## Implementation Gate

Implementation may begin in the AIChain Core-Geth fork only if it remains:

1. disabled by default;
2. unregistered for production or the shared Ethash devnet;
3. isolated from standard Ethereum RPC methods;
4. backed by the existing CPU verifier and engine negative tests; and
5. covered by race-detector and bounded-resource tests before any rented GPU is
   connected to it.

The first implementation target is a local, disposable single-node harness.
Genesis activation, public exposure, pool protocols, rewards, production
difficulty, and launch economics remain **TBD**.

## Implementation Progress

Core-Geth commit `499ae19` implements the transport-independent work registry:

- deterministic, domain-separated opaque work identifiers;
- node-owned immutable header templates and targets;
- 10–300 second lifetime and maximum 64 active records;
- bounded concurrent CPU verification;
- canonical-parent and expiry checks before and after verification;
- one-time acceptance and duplicate rejection; and
- a real C1 seal path plus concurrent race-detector coverage.

Core-Geth commit `2bb7d0f` adds strict canonical wire encoding and decoding. It
rejects unknown or duplicate fields, missing fields, wrong versions,
noncanonical hexadecimal values, wrong lengths, non-string fields, and trailing
JSON.

Core-Geth commit `724f3d9` adds the service behavior and exercises the proposed
`aichain_getKawpowWork` and `aichain_submitKawpowWork` methods through an
in-memory Core-Geth RPC server. It enforces the 4 KiB submission limit and
stable rejection statuses. The service deliberately does not register itself;
an explicit node integration, local exposure controls, rate limiting, template
provider, and block-import callback remain pending.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial development-only node/miner work contract |
| 0.2 | 2026-08-23 | Recorded the tested bounded work-registry implementation |
| 0.3 | 2026-08-23 | Recorded strict wire decoding and the tested but unregistered RPC service |
