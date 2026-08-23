# Phase 2A C2 FiroPoW Candidate Rules

| Field | Value |
|---|---|
| Status | Accepted for isolated C2 source/vector compatibility testing only |
| Version | 0.1 |
| Last updated | 2026-08-23 |
| Scope | Isolated Core-Geth development boundary only |
| L1-001 status | **TBD — no mining-algorithm selection** |

## Purpose

Define the narrow C2 FiroPoW compatibility work that is authorised after the
bounded-height policy decision. It provides a reproducible CPU-side test path,
not an activated consensus implementation.

## Pinned Source

| Item | Value |
|---|---|
| Upstream | [`firoorg/firo`](https://github.com/firoorg/firo) |
| Revision | `adba4310a1b118f879cb16013c669ea8b7dae01f` |
| Repository licence | MIT |
| Algorithm revision declared by source | ProgPoW 0.9.4, Firo parameters |
| Official vectors | `src/crypto/progpow/firopow_test_vectors.hpp` |
| Verifier height parameter | signed `int` |

## Candidate Constraints

- The initial bridge must accept only heights `0` through `2,147,483,647`
  inclusive and reject an out-of-range height before native conversion.
- Full-node candidate verification must execute on CPU; GPU software, if later
  evaluated, belongs only to a development mining path.
- The first test must prove an official positive vector and a tampered-mix
  rejection using the pinned source.
- Header mapping, target conversion, `consensus.Engine`, mining, chain-config,
  genesis, VPS, laptop, and public-devnet changes are explicitly out of scope.

## Migration Treatment

The bounded range is not a launched-chain parameter. Before any algorithm
selection or engine proposal, the project must define the selected block
interval and approve a consensus migration decision sufficiently before this
range can be reached. AI receipt capacity continues to scale through batch and
rollup submission paths rather than faster PoW blocks.

## Exit Criteria

1. Pinned-source provenance and licence are recorded.
2. Official valid vector passes through a CPU bridge.
3. A tampered mix and an out-of-range height are rejected.
4. The boundary remains inactive and has no engine-selection call path.
5. C2 performance and integration findings are compared with C1 before any
   L1-001 proposal.

## Current Evidence

The pinned Windows Go 1.21.13 / LLVM-MinGW CPU control passed on 2026-08-23:

- official FiroPoW vector at height `1`;
- tampered-mix rejection for that vector; and
- negative and greater-than-`2,147,483,647` height rejection before C API
  conversion.

No target/header mapping or network-facing integration was exercised.

The subsequent source review confirmed that Firo's canonical header commitment
and compact-target model do not directly map to Core-Geth without a separate
AIChain protocol choice. See [C2 FiroPoW Header-Mapping Review](phase-2a-c2-firopow-header-mapping-review.md).
Accordingly, C2 remains a CPU verifier control and not a header-derived
candidate boundary.

## Local CPU Verification Control

Five short warmed serial controls of the official-vector verifier had a median
of **2.666 ms/op**, **112 B/op**, and **1 allocation/op** on the local i5-1335U
control environment. The figure excludes epoch construction, header/target
mapping, block import, mining, networking, and GPU work. Its comparable C1
serial control was 2.645 ms/op; neither result selects a candidate. Full raw
results are in [the C2 benchmark manifest](../benchmarks/pow/runs/2026-08-23-c2-firopow-cpu-verifier-control.json).

## Explicit Non-Decisions

- C2 does not select FiroPoW.
- C2 does not adopt Firo network parameters, supply, block timing, or rules.
- C2 does not imply an ASIC-resistance guarantee.
- C2 does not authorise GPU mining or any network activation.
