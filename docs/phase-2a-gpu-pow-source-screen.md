# Phase 2A GPU PoW Source Screen

| Field | Value |
|---|---|
| Status | Initial screen complete — no candidate selected |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Decision affected | L1-001 — still **TBD** |

## Screening Criteria

Each candidate was screened for an official or canonical source, active
maintenance, GPU-oriented mining, CPU-verifiable work, a clear test-vector path,
and a safe long-term height strategy. This is source due diligence, not a
benchmark or security audit.

## Results

| Candidate | Positive evidence | Height/API finding | Disposition |
|---|---|---|---|
| C1 KawPoW | Off-the-shelf ProgPoW-family source, deterministic vectors, working Core-Geth boundary | Pinned 2020 `cpp-kawpow` API uses signed `int` | Retain as CPU control and benchmark candidate; no engine integration yet |
| C2 FiroPoW | Official Firo source is active; it describes FiroPoW as GPU-targeted and FPGA/ASIC-resistant; ships vectors | `CProgPowHeader::nHeight` is `uint32_t`, but the embedded `progpow::hash`/`verify` API uses signed `int` | Shortlist for a separate source/vector compatibility review; do not integrate yet |
| C3 Autolykos v2 | Official Ergo source is active; memory-hard GPU mining ecosystem and efficient validation path | Production header and history interfaces use Scala `Int` | Do not integrate in Phase 2A; it also has a different node/model and height boundary |
| FishHash | Open source implementation and specification available | Repository labels itself a work in progress | Exclude from current consensus candidates |
| kHeavyHash | Clear reference implementations exist | Public reference material explicitly expects ASIC implementations | Exclude: inconsistent with the GPU/ASIC-resistance objective |

## Audit Evidence

### C2 FiroPoW

The official `firoorg/firo` repository was audited at commit
`adba4310a1b118f879cb16013c669ea8b7dae01f` (2026-08-17).

- `src/crypto/progpow.h` defines `CProgPowHeader::nHeight` as `uint32_t`.
- `src/crypto/progpow/include/ethash/progpow.hpp` exposes `hash` and `verify`
  with `int block_number`.
- The project includes FiroPoW test vectors in
  `src/crypto/progpow/firopow_test_vectors.hpp`.

### C3 Autolykos v2

The official `ergoplatform/ergo` repository was audited at commit
`c313356950fe69ef406c2ee031204079a05ea7d7` (2026-08-18).

- `ergo-core/.../AutolykosPowScheme.scala` is the production PoW scheme.
- The production header model defines `height: Int` in
  `ergo-core/.../modifiers/history/header/Header.scala`.
- The production history paths also use `Int` heights.

## Recommendation

The initial hard requirement for a currently maintained **64-bit** reference
API is not met by the established GPU-oriented candidates screened here. Do not
create a custom 64-bit cryptographic variant merely to satisfy it.

Instead, the decision gate should require a **bounded-height migration plan**:

1. Specify the candidate's exact supported height range.
2. Select a launch block interval only after network testing; do not rely on
   sub-second PoW blocks for AI throughput.
3. Schedule a consensus-upgrade decision well before the height limit.
4. Keep AI throughput scaling in batch/rollup submission layers, independent of
   block frequency.

This makes the limit visible and governable without pretending it does not
exist. It does not select C1 or C2.

## Next Gate

Before C2 implementation work, decide whether the bounded-height migration
strategy is acceptable for the AIChain PoW candidate programme. If accepted,
perform a C2 FiroPoW source/vector compatibility spike in a disposable
worktree; if not, continue the source screen with a different mining model.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial C1/C2/C3 GPU PoW source screen |
