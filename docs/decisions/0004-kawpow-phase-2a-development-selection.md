# ADR-0004: KawPoW Phase 2A Development Selection

| Field | Value |
|---|---|
| Status | Accepted for Phase 2A implementation and benchmarking |
| Date | 2026-08-23 |
| Decision ID | L1-001 development track |
| Scope | Candidate engine work only; not a public-network activation |

## Context

AIChain has accepted an independent EVM/Core-Geth L1 architecture, a
GPU-targeted PoW direction, and one canonical EVM-derived block-header model.
The Phase 2A screen found no maintained, drop-in verifier that clears every
selection gate without work.

The realistic options were:

| Option | Maintenance / modification burden | Result |
|---|---|---|
| Ethash / Etchash | Lowest | Reject: too weak a fit for AIChain's GPU-versus-specialised-hardware objective |
| New EIP-1057/ProgPoW implementation | Highest | Defer: AIChain would own a new consensus-critical implementation and GPU-miner ecosystem |
| FiroPoW / Autolykos | High | Reject for this track: foreign header models require AIChain-specific consensus mappings |
| KawPoW using the existing Apache-2.0 C1 reference boundary | Lowest viable | **Select for Phase 2A work** |

The selected C1 boundary already uses a pinned Apache-2.0
`cpp-kawpow` reference, published vectors, and a tested Core-Geth pre-seal
header adapter. It does not import the Ravencoin header or compact-target
model. This is the smallest modification and maintenance path that preserves
the GPU-oriented goal and ADR-0003's header rule.

## Decision

1. **KawPoW is AIChain's Phase 2A development candidate of record.**
2. Candidate engine work must build on the existing narrow C1 verifier
   boundary and its Apache-2.0 pinned reference/vector corpus; it must not
   import Ravencoin, Quai, Firo, or another network's full consensus/header
   rules.
3. The canonical AIChain block header remains Core-Geth/EVM-derived. Its
   pre-seal commitment, nonce, proof/mix field, height input, and target
   comparison must be specified and vectorised before engine activation.
4. The C1 reference's signed 32-bit height boundary is a launch constraint
   under the accepted bounded-height migration policy. It may not be
   widened silently. A future consensus transition must be designed and
   approved well before that bound is approached.
5. The existing Ethash development network remains unchanged until the
   candidate engine, genesis transition, mining path, and testnet gates pass.

## Why This Is the Lowest-Maintenance Viable Choice

- The project already has an isolated Core-Geth verifier boundary, 13 passing
  public vectors, a pre-seal-header mapping control, and CPU verification
  measurements for C1.
- The reference has a permissive Apache-2.0 licence, unlike the C4 source
  lead's wider GPL/provenance boundary.
- KawPoW has a live GPU mining ecosystem and is explicitly designed to reduce
  the efficiency advantage of specialised hardware; this is resistance, not a
  promise of permanent ASIC exclusion.
- A direct Ethash/Etchash route would be less work but would abandon the
  distinguishing GPU/ASIC-resistance objective. A clean-room ProgPoW
  implementation would be more future-flexible but transfers substantially
  more security maintenance to AIChain.

## Explicitly Not Decided

This ADR does **not** freeze or activate the final L1-001 production decision.
The following remain **TBD**:

- source-update policy and an independently reviewed long-term replacement or
  migration path for the pinned reference;
- exact AIChain KawPoW header adapter, byte-order rules, nonce/proof storage,
  target/difficulty adjustment, block interval, rewards, and genesis
  activation;
- GPU performance on NVIDIA and AMD hardware, CPU validation/DoS limits,
  miner interoperability, pool protocol, and ASIC/FPGA economics;
- launch/testnet date, chain ID, economics, and public-network activation;
- post-quantum account/signature migration. KawPoW is not a quantum-resistance
  claim.

## Required Exit Gates

KawPoW may not replace Ethash on even a private testnet until all of the
following are committed and reviewed:

1. Versioned AIChain header-to-KawPoW adapter specification and positive,
   negative, byte-order, nonce, and target vectors.
2. Consensus-engine spike with invalid-block, reorganisation, difficulty, and
   activation tests.
3. Separate CPU and rented-GPU benchmark reports, including verification cost,
   propagation/orphan effects, and AVR batch throughput.
4. GPU miner interoperability demonstration on at least NVIDIA and AMD
   hardware, or a documented reason to defer one platform.
5. Security review covering DoS/cache handling, height limit, source pin,
   supply-chain, ASIC/FPGA assumptions, and a migration/rollback plan.
6. Explicit release decision that upgrades this development selection to the
   final L1-001 consensus rule.

## Consequences

Phase 2A can now start bounded engine design and mining compatibility work
without inventing a new hash algorithm or importing an incompatible foreign
chain. It also accepts a clear maintenance obligation: AIChain must retain the
reference pin, conformance vectors, and a documented upgrade path instead of
assuming KawPoW will stay GPU-favourable indefinitely.

## References

- [ADR-0003: EVM-Native PoW Header Compatibility](./0003-evm-native-pow-header-compatibility.md)
- [C1 source audit](../phase-2a-c1-source-audit.md)
- [C1 integration spike](../phase-2a-core-geth-integration-spike.md)
- [Phase 2A source screen](../phase-2a-gpu-pow-source-screen.md)
- [KawPoW conformance boundary assessment](../phase-2a-c4-quai-kawpow-conformance-provenance-assessment.md)
