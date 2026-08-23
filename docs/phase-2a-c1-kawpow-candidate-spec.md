# Phase 2A C1 KawPoW Candidate Rules

| Field | Value |
|---|---|
| Status | Superseded in part by ADR-0004 — disabled Phase 2A engine spike authorised |
| Version | 0.2 |
| Last updated | 2026-08-23 |
| Scope | `aichain/phase-2a-kawpow-spike` only |
| L1-001 status | **KawPoW selected for Phase 2A development only; production selection remains TBD** |

## Purpose

Define the narrow rules used by the C1 KawPoW/ProgPoW candidate verifier so
tests cannot silently choose consensus behaviour. These rules originally
limited C1 to an isolated verifier. [ADR-0004](decisions/0004-kawpow-phase-2a-development-selection.md)
subsequently authorised a disabled Core-Geth engine boundary under these same
rules. They still do not alter the VPS/laptop devnet, genesis, mining, or any
public-network behaviour.

## Candidate Rules

| Rule | C1 value | Reason |
|---|---|---|
| Reference source | `RavenCommunity/cpp-kawpow` at `061d341011ca341e1f506c52b571f5fd64a0df71` | Pinned, auditable CPU verifier source |
| Height range | `0` through `2,147,483,647` inclusive | The pinned API accepts a signed 32-bit block number |
| Minimum difficulty | `2` | Avoids the unrepresentable `2^256` target at difficulty `1` |
| Target formula | `floor(2^256 / difficulty)` | Matches the existing Core-Geth Ethash convention for the candidate test boundary |
| Target encoding | Unsigned 256-bit, big-endian | Required by the pinned C1 verifier input |
| Verification hardware | CPU | Full-node validation must not require a GPU |

## Explicit Non-Decisions

- C1 does not select KawPoW as AIChain's final PoW algorithm.
- C1 does not set a launched chain's block interval, minimum difficulty, or
  issuance rule.
- C1 alone does not authorise a miner, genesis, RPC, or devnet change. The
  disabled engine boundary is authorised separately by ADR-0004.
- C1 does not claim the 32-bit reference API is adequate for the final L1.

## Required Tests

- Known positive C1 vector.
- Tampered mix rejection.
- Header-derived positive verification.
- Changed-difficulty rejection.
- Reject non-positive difficulty and candidate difficulty `1`.
- Reject heights outside the pinned reference API's range at both header and
  direct-native-bridge boundaries.
- Preserve Core-Geth Ethash pre-seal hash compatibility for the candidate
  mapping.

## Exit Criteria for C1

Before C1 can move toward production activation or a shared-devnet proposal:

1. A documented disposition exists for the 32-bit height limitation, supported
   by a maintained/canonical implementation or an explicit future protocol
   migration plan.
2. Candidate minimum-difficulty and target-encoding rules have an approved
   protocol owner and migration treatment.
3. Repeated CPU, GPU-mining, block-import, and multi-node measurements are
   recorded.
4. L1-001 is resolved for production through a later ADR; ADR-0004 resolves
   only the bounded Phase 2A development selection.

## C1 Source-Audit Disposition

The source audit in [Phase 2A C1 Source Audit](phase-2a-c1-source-audit.md)
found no maintained, released canonical 64-bit block-height API in the selected
reference repository. ADR-0004 later accepted the explicit bounded-height
migration policy and authorised the disabled engine wrapper. The finding still
prevents silent production adoption and does not authorise engine registration,
genesis, mining RPC, or a shared-devnet change.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial candidate-only rules agreed for C1 testing |
| 0.2 | 2026-08-23 | Reconciled the historical C1 boundary with ADR-0004's disabled engine authorisation |
