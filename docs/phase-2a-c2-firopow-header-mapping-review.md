# Phase 2A C2 FiroPoW Header-Mapping Review

| Field | Value |
|---|---|
| Status | Source review complete — no Core-Geth mapping implemented |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Source | `firoorg/firo` `adba4310a1b118f879cb16013c669ea8b7dae01f` |
| L1-001 status | **TBD — no mining-algorithm selection** |

## Finding

The pinned Firo source provides a clear Firo-native mapping, but it cannot be
copied into a Core-Geth header adapter without choosing new protocol rules.
No C2 `HeaderTo…` function is therefore implemented.

## Evidence from the Pinned Source

Firo's `src/crypto/progpow.h` defines `CProgPowHeader`, serialized as these
fields in this order:

```text
nVersion | hashPrevBlock | hashMerkleRoot | nTime | nBits | nHeight
```

It intentionally excludes the 64-bit nonce and mix hash from that serialized
header commitment. `src/crypto/progpow.cpp` then:

1. computes `SerializeHash(CProgPowHeader)`;
2. converts that hash into the native verifier's byte layout;
3. calls FiroPoW with `nHeight` and `nNonce64`; and
4. compares the resulting final hash with a target decoded from Bitcoin-style
   compact `nBits` (`src/pow.cpp`).

Firo's full block validation also performs a separate full mix-hash check.

## Why a Direct Core-Geth Mapping Is Not Justified

Core-Geth's current EVM header exposes different canonical fields and uses a
full integer difficulty rather than Firo's compact `nBits`. A direct mapping
would require at least these new AIChain decisions:

| Required decision | Why it cannot be inherited from Firo |
|---|---|
| C2 header commitment/preimage | Firo serializes a Bitcoin-style six-field header; Core-Geth's RLP header has different fields and evolution rules. |
| Difficulty-to-boundary rule | Firo decodes compact `nBits`; C1 currently uses candidate-only `floor(2^256 / difficulty)`. Neither is a shared default. |
| 64-bit nonce placement | Firo keeps it outside its serialized commitment; a Core-Geth candidate must define the exact field and byte order. |
| Mix-proof treatment | Firo separately verifies `mix_hash`; Core-Geth's `MixDigest` may be a convenient carrier but does not settle semantics. |
| Header-version evolution | C1 currently rejects unsupported post-Ethash fields. A C2 rule must state how optional/new EVM header fields participate. |

Adopting Firo's surrounding Bitcoin header, compact-target encoding, or
network parameters would be a materially different L1 design decision and is
out of scope for this candidate compatibility spike.

## Disposition

C2 remains a CPU-vector and verifier-performance candidate only. It has not
met the header-derived verification exit criterion and must not move to a
Core-Geth engine or mining proposal.

The next PoW decision gate must either:

1. define an AIChain-native, versioned EVM-header commitment plus target and
   nonce/mix rules for the shortlisted candidate, then require independent
   vectors and review; or
2. retain C1/C2 as verifier controls and select a candidate whose canonical
   header model maps more directly to the desired EVM chain design.

Neither option is selected by this review.

