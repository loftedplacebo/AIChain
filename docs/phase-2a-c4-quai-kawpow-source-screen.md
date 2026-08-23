# Phase 2A C4 — Quai KawPoW Source Screen

| Field | Value |
|---|---|
| Status | Source lead only — not approved for reuse or integration |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0003](./decisions/0003-evm-native-pow-header-compatibility.md) |
| L1-001 status | **TBD — no mining algorithm selected** |

## Scope

This is a read-only source and provenance screen conducted under Path B of the
[EVM-compatibility gate review](./phase-2a-evm-compatibility-gate-review.md).
It does not copy code, create an AIChain dependency, alter Core-Geth, or
change the development network.

## Material Examined

| Item | Record |
|---|---|
| Upstream | [dominant-strategies/go-quai](https://github.com/dominant-strategies/go-quai) |
| Revision | `208b67554a9078086c8de7c9ab0a9b5af2d9d567` |
| Revision date | 2026-08-19 |
| Examined area | `consensus/kawpow` |
| Repository licence | GPL-3.0 |

## Positive Findings

- The KawPoW area provides a verifier boundary shaped as
  `VerifyKawpowShare(headerHash, nonce, blockNumber)`.
- Its lower-level KawPoW path takes a 64-bit block number. This avoids the
  immediate signed-32-bit API boundary observed in the isolated C1 reference.
- The source contains deterministic-behaviour and real-block tests. This is
  useful evidence that the implementation is live and exercised within its own
  network.

These are source-screen observations, not proof that an AIChain header mapping
is valid.

## Blocking Findings

1. **Protocol boundary:** Quai uses its own PoEM, work-object/header,
   multi-algorithm, and merged-mining context. AIChain's agreed architecture
   remains an independent Core-Geth-derived PoW L1 with one canonical EVM
   header. None of those foreign rules may be inherited implicitly.
2. **Reuse boundary:** the upstream repository is GPL-3.0 and the inspected
   area has mixed provenance/file headers. Direct source copying, linking,
   importing, or vendoring is prohibited until a specific licence and
   dependency review establishes an acceptable path.
3. **Conformance boundary:** Quai-local tests do not replace an independent
   AIChain adapter specification or comparison to public KawPoW vectors.
4. **Mining boundary:** no GPU miner path, performance claim, or ASIC
   resistance claim transfers from this source screen to AIChain.

## Disposition

**C4 is a maintained KawPoW source lead, not an engine candidate.** It improves
the evidence base for Path B but does not clear ADR-0003's mapping,
reproducibility, maintainability, or legal-reuse gates.

## Permitted Next Work

- Trace the licence and dependency provenance of the minimal generic verifier
  boundary.
- Compare independently generated KawPoW results with public vectors without
  importing Quai source into AIChain.
- Document any viable clean-room or separately licensed implementation path
  before proposing code work.

## Explicitly Not Permitted by This Screen

- Importing or vendoring Quai code into Core-Geth or AIChain.
- Adopting Quai's PoEM, work-object, multi-algorithm, or merged-mining rules.
- Changing the current Ethash development network.
- Selecting KawPoW, claiming quantum resistance, or claiming GPU/ASIC
  properties for AIChain.

## Evidence References

- [Quai source repository](https://github.com/dominant-strategies/go-quai).
- [Quai network overview](https://docs.qu.ai/learn/use-quai).
- [Quai PoEM overview](https://docs.qu.ai/learn/advanced-introduction/poem/poem).
