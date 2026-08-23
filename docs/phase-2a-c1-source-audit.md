# Phase 2A C1 Source Audit — Block-Height API

| Field | Value |
|---|---|
| Status | Complete for C1 decision gate |
| Version | 0.1 |
| Audit date | 2026-08-23 |
| Scope | C1 pinned `cpp-kawpow` reference only |

## Question

Is there a maintained, canonical 64-bit block-height API in the selected
KawPoW/ProgPoW reference source that AIChain can use without inventing an
AIChain-specific cryptographic variant?

## Evidence

The pinned source is `RavenCommunity/cpp-kawpow` at
`061d341011ca341e1f506c52b571f5fd64a0df71`, tagged `1.2.0`.

An upstream remote audit on 2026-08-23 found that `master` still points to that
commit, dated 2020-04-20. Its released tags end at `1.2.0`; no newer released
canonical API was found.

The pinned public API uses signed `int` block numbers in:

- `include/ethash/ethash.hpp` — `get_epoch_number(int block_number)`;
- `include/ethash/progpow.hpp` — public `hash`, `verify`, and search methods;
- `lib/ethash/progpow.cpp` — corresponding implementation methods.

## Conclusion

**C1 does not satisfy the original maintained canonical 64-bit implementation
criterion.** The implementation is valid for isolated vector, mapping, and CPU
benchmark work. The subsequent [GPU PoW Source Screen](phase-2a-gpu-pow-source-screen.md)
found the same bounded-height pattern in the established candidates audited, so
the programme now requires an explicit bounded-height migration strategy rather
than a custom cryptographic variant. C1 is not suitable for an AIChain
consensus-engine proposal without one of the following:

1. a maintained and canonical 64-bit implementation accepted as the candidate
   reference; or
2. an explicitly specified, independently reviewed AIChain variant and a
   migration plan.

Option 2 would create a custom cryptographic/protocol variant and is **not
recommended** during Phase 2A.

## Disposition

- Keep C1 as a completed off-the-shelf verifier and CPU-control candidate.
- Do not attach C1 to `CreateConsensusEngine`, a miner, genesis, or the shared
  devnet.
- Do not remove the explicit C1 height and target guards.
- Before any implementation escalation, record whether the bounded-height
  migration strategy is accepted for the candidate programme.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial source/API audit and C1 disposition |
