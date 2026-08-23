# Phase 2A PoW Header and Target Mapping Contract

| Field | Value |
|---|---|
| Status | Accepted test-boundary contract; not an activated consensus specification |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Scope | Isolated C1/C2 candidate work only |
| L1-001 status | **TBD — no mining-algorithm selection** |

## Purpose

Define how a future candidate adapter must describe its conversion from a
Core-Geth `types.Header` into native PoW-verifier input. The contract prevents
one candidate's assumptions from silently becoming a shared L1 rule.

This document does not authorise `consensus.Engine` work, header-format
changes, mining, genesis changes, devnet changes, or a final PoW selection.

## Shared Adapter Envelope

Each candidate mapping must create and test a versioned envelope containing:

| Field | Shared requirement | Candidate-specific decision still required |
|---|---|---|
| Candidate ID and source revision | Immutable identifier and pinned source revision | Exact identifier value |
| Header height | Derive as unsigned Core-Geth header number; reject nil/invalid input | Native API range and pre-conversion guard |
| Header commitment | Pass an exactly 32-byte verifier commitment | Preimage fields, encoding, field exclusions, and hash function |
| Nonce | Preserve the header's 8-byte nonce without loss | Byte order and native integer interpretation |
| Mix/proof field | Preserve the header's 32-byte `MixDigest` for verification | Whether it is the candidate's proof field and its byte order |
| Difficulty | Require a positive integer | Candidate minimum, difficulty adjustment, and conversion formula |
| Target/boundary | Require an exactly 32-byte verifier boundary when a verifier needs one | Formula, rounding, byte order, and treatment of values wider than 256 bits |
| Verification result | Return valid/invalid plus a typed mapping error | Native verifier error translation |

No generic mapping function may assume that a Core-Geth Ethash pre-seal RLP
hash, `2^256 / difficulty`, big-endian target, or `uint64` nonce interpretation
is correct for every candidate.

## Required Safety Rules

1. Reject a nil header, nil number, and non-positive difficulty before calling
   native code.
2. Enforce every candidate's supported height range before a narrowing native
   conversion. For the current C1 and C2 references that range is
   `0..2,147,483,647`.
3. Reject an unrepresentable boundary; do not truncate, wrap, or clamp a
   target to fit a 256-bit verifier input.
4. Preserve the original header fields for test inspection. A verifier
   commitment must be derived, not substituted back into the header.
5. Keep mapping code outside engine selection until a candidate's rules,
   upgrade path, and L1-001 ADR are accepted.

## Candidate Matrix

| Mapping element | C1 KawPoW | C2 FiroPoW |
|---|---|---|
| Source revision | `cpp-kawpow` `061d341…` | `firoorg/firo` `adba431…` |
| Native height range | `0..2,147,483,647` | `0..2,147,483,647` |
| Header commitment | Current Core-Geth Ethash-style pre-seal RLP hash; tested only as C1 candidate mapping | Firo source serializes a distinct Bitcoin-style six-field header; no compatible Core-Geth preimage selected |
| Nonce interpretation | `header.Nonce.Uint64()` in current C1 boundary | Firo uses a separate 64-bit nonce, but Core-Geth placement and byte order are **TBD** |
| Mix field | `header.MixDigest`; tested only as C1 candidate mapping | Firo verifies a separate mix hash; carrier and semantics in Core-Geth are **TBD** |
| Difficulty/target | Candidate-only `floor(2^256 / difficulty)`, unsigned 256-bit big-endian, minimum difficulty 2 | Firo decodes compact `nBits`; Core-Geth conversion is **TBD** and must not inherit C1's rule |

The C1 mapping is useful evidence, not a reusable default. The C2 source
review found that FiroPoW's canonical header/target model is materially
different from Core-Geth's; see [C2 FiroPoW Header-Mapping Review](phase-2a-c2-firopow-header-mapping-review.md).
No `HeaderTo…` function is justified until a separate AIChain-native mapping
decision is made and independently vectorised.

## Required Candidate Mapping Tests

- Exact positive header-derived native-verifier case.
- Altered header-commitment rejection.
- Altered nonce rejection where the candidate uses a nonce.
- Altered mix/proof rejection.
- Changed-difficulty or changed-boundary rejection.
- Nil/malformed header and non-positive difficulty rejection.
- Boundary-width rejection and out-of-range-height rejection before native
  conversion.
- Equality against a documented candidate-specific preimage/commitment test
  vector.

## Performance and AI Throughput Boundary

Header mapping and CPU seal verification are consensus-path costs. They are
not the mechanism for high-volume AI receipt submission. AVR batching and
rollup design remain the scale path; block-frequency changes require separate
network, security, and mining evaluation.

## Next Step

Use this contract to perform a C2 FiroPoW header/target mapping source review.
If the required mapping cannot be demonstrated from the pinned source and
official vectors without importing unrelated Firo consensus rules, record that
as a candidate limitation rather than filling the gap with an AIChain-specific
assumption.
