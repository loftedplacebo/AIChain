# Phase 2A KawPoW Engine Design

| Field | Value |
|---|---|
| Status | Approved design boundary — implementation not yet enabled |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0004](./decisions/0004-kawpow-phase-2a-development-selection.md) |

## Purpose

Define the smallest safe Core-Geth implementation path for the selected KawPoW
development candidate. This document does not activate a consensus engine,
change genesis, or alter the Ethash development network.

## Engine Boundary

The implementation will add a disabled-by-default consensus.Engine
implementation in the AIChain Core-Geth fork. It will reuse only the existing
AIChain consensus/kawpow verifier boundary and pinned Apache-2.0 reference
submodule.

| Engine method | Phase 2A responsibility | Must not do yet |
|---|---|---|
| SealHash | Return the versioned Core-Geth pre-seal commitment | Adopt a foreign-chain header serialization |
| VerifySeal | Derive the candidate verifier input; validate mix/proof and target | Accept a truncated height or implicit byte-order conversion |
| VerifyHeader(s) | Reuse equivalent non-seal header rules, then call VerifySeal when requested | Change active chain routing |
| CalcDifficulty | Begin with a clearly named development-only rule and deterministic tests | Freeze launch block time or economics |
| Seal | Return an explicit mining-unavailable error until an interoperable GPU miner exists | Ship a CPU fallback as an economic mining path |
| Finalize / FinalizeAndAssemble | Match current development PoW reward behaviour only through an explicit temporary policy | Select production rewards |

## Candidate Header Mapping

```text
Core-Geth header
      │
      ├─ pre-seal RLP commitment → 32-byte KawPoW header-hash input
      ├─ header number           → checked C1 signed-32-bit height input
      ├─ header nonce            → 64-bit nonce input
      ├─ header mix digest       → 32-byte KawPoW mix/proof input
      └─ difficulty              → explicit 256-bit target comparison
```

The mapping is candidate-only until the following are committed as public,
versioned vectors: valid seal, tampered mix, wrong nonce, byte-order mismatch,
wrong target, non-positive difficulty, and height boundary.

## Implementation Order

1. Create an engine package that satisfies the Core-Geth interface while
   remaining unreachable from chain configuration.
2. Port only header structural checks needed by the development engine; add
   positive and negative unit tests first.
3. Integrate the existing C1 verifier into VerifySeal, including cache/DoS
   limits and the explicit height guard.
4. Add deterministic development-only difficulty tests.
5. Add a no-miner Seal implementation so the engine cannot be accidentally
   used to mine.
6. Run focused tests alongside the current Ethash suite.
7. Review the result before any genesis/configuration switch or GPU rental.

## Acceptance Tests Before Any Devnet Switch

- Engine is absent from normal engine selection and the Ethash devnet behaves
  identically before and after the code is merged.
- Valid C1 vectors pass; wrong header commitment, mix, nonce, target,
  difficulty, and height fail.
- Sequential and parallel header verification are deterministic.
- The configured cache has explicit size, eviction, and allocation limits.
- Seal fails closed until an independently tested GPU miner exists.
- No node, RPC, firewall, VPS, wallet, or genesis setting changes.

## Open Decisions

- Exact production difficulty adjustment and block interval.
- Header proof-field encoding and activation block.
- GPU miner protocol/interoperability, NVIDIA and AMD benchmarks.
- Cache sizing under node load and final DoS limits.
- Testnet transition, reward schedule, and all production L1-001 values.

## Non-Goals

- Quantum-resistance claims.
- Proof-of-AI consensus.
- GPU mining implementation or a public testnet.
- Any change to AVR batching, EVM execution, or existing Phase 1 assets.
