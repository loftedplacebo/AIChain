# Phase 2A C1 Source Audit — Block-Height API

| Field | Value |
|---|---|
| Status | Complete — source finding retained; implementation disposition superseded by ADR-0004 |
| Version | 0.2 |
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
criterion.** The implementation is valid for vector, mapping, CPU benchmark,
and bounded development-engine work under the later ADR. The subsequent [GPU PoW Source Screen](phase-2a-gpu-pow-source-screen.md)
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

## Subsequent Decision

[ADR-0004](decisions/0004-kawpow-phase-2a-development-selection.md) accepted
the bounded-height migration strategy and selected KawPoW as the
lowest-maintenance Phase 2A development path. That decision does not invalidate
this audit. It authorises a disabled `consensus/kawpowengine` wrapper with
explicit height guards; it does not authorise registration in
`CreateConsensusEngine`, a miner, genesis, or the shared devnet.

## Disposition

- Keep C1 as the pinned verifier and CPU-control source behind the disabled
  Phase 2A engine wrapper.
- Do not attach C1 to `CreateConsensusEngine`, a miner, genesis, or the shared
  devnet without later gates and an explicit decision.
- Do not remove the explicit C1 height and target guards.
- Before any implementation escalation, record whether the bounded-height
  migration strategy is accepted for the candidate programme.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial source/API audit and C1 disposition |
| 0.2 | 2026-08-23 | Preserved the source finding while recording ADR-0004's bounded engine-spike authorisation |
