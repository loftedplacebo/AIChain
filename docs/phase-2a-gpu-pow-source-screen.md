# Phase 2A GPU PoW Source Screen

| Field | Value |
|---|---|
| Status | Bounded-height policy accepted; expanded screen complete; no candidate selected |
| Version | 0.3 |
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
| C4 Quai KawPoW source lead | Active Go KawPoW implementation with a generic hash/nonce/`uint64`-height entry point and local real-block tests | The overall source is bound to Quai-specific PoEM/work-object/merged-mining paths | Source lead only; direct reuse is not authorised pending a licence/provenance review and independent vector comparison |

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

## Accepted Candidate-Programme Policy

On 2026-08-23, AIChain accepted the bounded-height migration strategy for
isolated Phase 2A candidate work. For every candidate using a bounded-height
reference API, the spike must:

1. Enforce the reference implementation's documented range before crossing a
   language or native-API boundary.
2. Treat the range as a candidate constraint, not as a silently inherited L1
   rule.
3. Require a consensus-upgrade decision well before the range could be
   exhausted by the selected launch block interval.
4. Keep high-volume AI receipt throughput in batching/rollup layers rather
   than reducing the PoW block interval to compensate.

This authorises source/vector compatibility work for C2 FiroPoW. It does not
select FiroPoW, change any consensus engine, or activate a network rule.

## EVM-Compatibility Selection Gate

Accepted [ADR-0003](./decisions/0003-evm-native-pow-header-compatibility.md)
requires the final PoW candidate to work with one Core-Geth/EVM-derived
canonical header model. A standalone verifier is insufficient if its canonical
source requires importing another network's header serialization or target
model. Candidate-specific adapter rules must be explicit and vectorised; the
final algorithm remains **TBD**.

## Next Gate

The C2 source/vector spike and header-mapping review are complete. Under
accepted ADR-0003, no current candidate may advance to engine work as-is; see
[EVM-Compatibility Gate Review](phase-2a-evm-compatibility-gate-review.md).
The next decision is whether to own a standards-conforming EIP-1057/ProgPoW
implementation or continue screening for a maintained candidate with an
existing EVM-header fit.

The expanded screen has now identified C4 as a maintained source lead, but it
does not change that decision: it is not a drop-in EVM/Core-Geth engine. See
[the C4 screen](./phase-2a-c4-quai-kawpow-source-screen.md).

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Initial C1/C2/C3 GPU PoW source screen |
| 0.2 | 2026-08-23 | Recorded accepted bounded-height migration policy and opened the isolated C2 source/vector spike |
| 0.3 | 2026-08-23 | Recorded the C4 Quai KawPoW maintained-source lead and its no-reuse boundary |
