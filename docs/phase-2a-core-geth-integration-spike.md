# Phase 2A Core-Geth Integration Spike

| Field | Value |
|---|---|
| Status | Active, development-only preparation |
| Version | 0.9 |
| Last updated | 2026-08-23 |
| Decision affected | L1-001 — no selection made |

## Purpose

Prepare a safe, CPU-verifiable route for testing Phase 2A PoW candidates without changing the shared devnet or representing any candidate as selected.

## Confirmed Core-Geth boundary

The AIChain-owned Core-Geth fork is [`loftedplacebo/core-geth`](https://github.com/loftedplacebo/core-geth). Phase 2A work is published on `aichain/phase-2a-kawpow-spike`; the parent repository pins that fork as its `node/core-geth` submodule source. The upstream `etclabscore/core-geth` remote remains a read-only comparison source.

The pinned Core-Geth source exposes a consensus-engine interface at `consensus/consensus.go`. The current Ethash implementation is contained under `consensus/ethash/`, including header verification, seal validation, seal-hash construction, and local sealing.

The candidate spike must preserve the same separation:

```text
candidate work implementation ──> consensus engine
                                      ├─ VerifyHeader / VerifyHeaders
                                      ├─ VerifySeal / SealHash
                                      ├─ CalcDifficulty
                                      └─ Seal (development mining only)
                                               │
                                               ▼
                                    Core-Geth chain / P2P / EVM
```

Full nodes must perform `VerifySeal` on CPU without a GPU. GPU software belongs to the mining/sealing path; it cannot become a requirement for block validation.

## Baseline evidence

On 2026-08-22, the repository’s pinned Windows Go/CGO toolchain ran:

```powershell
& C:\AIChain\.toolchains\go1.21.13\go\bin\go.exe test ./consensus/ethash
```

Result: **pass**. This is a focused CPU-only control test for the existing Ethash consensus package. It does not validate a GPU miner, public-network behaviour, or a final algorithm.

### C1 CPU conformance evidence

The committed runner [`scripts/run-c1-kawpow-vector-check.ps1`](../scripts/run-c1-kawpow-vector-check.ps1) compiled the Apache-2.0 `RavenCommunity/cpp-kawpow` reference at pinned commit `061d341011ca341e1f506c52b571f5fd64a0df71` with AIChain’s pinned Windows compiler and ran its deterministic ProgPoW vectors.

Result on 2026-08-22: **13 vectors passed**, including positive verification and tampered-mix rejection. The runner is CPU-only; it verifies a reference implementation and has not yet placed KawPoW in the Core-Geth consensus path. Source provenance is recorded in [Candidate Source Pins](../benchmarks/pow/candidate-source-pins.md).

### C1 Go adapter control result

The isolated [`c1-kawpow-verifier`](../spikes/c1-kawpow-verifier) Go/CGO adapter now calculates and verifies the pinned C1 vector with CPU-only calls. It passed its Go test suite, including known-output, valid-seal, tampered-seal, and invalid-block-number cases.

The first three-iteration control run on the local i5-1335U recorded approximately **504.67 ms/hash** and **507.24 ms/verify**. Both calls intentionally construct an epoch context each time, so these numbers are a conservative smoke control—not cached full-node validation cost, mining performance, energy use, or TPS. The complete environment and result are recorded in [the run manifest](../benchmarks/pow/runs/2026-08-22-c1-kawpow-cpu-adapter-control.json).

The follow-up bounded-cache control passed 13 vectors, tampered-seal rejection, and 24 concurrent hash/verify operations across 12 workers. Its five-iteration microbenchmark recorded approximately **391.24 ms/hash** and **384.10 ms/verify** with a forced context rebuild, versus **3.28 ms/hash** and **4.76 ms/verify** with the same epoch cached. These are not final full-node figures: the current one-epoch cache serialises calls with a mutex and exists only to establish correct cache semantics. See [the cached-epoch run manifest](../benchmarks/pow/runs/2026-08-22-c1-kawpow-cached-epoch-control.json).

### Core-Geth header mapping contract

Before the fork boundary was added, the isolated spike imported the pinned Core-Geth module without modifying its source. Its mapping test derives the actual Core-Geth `SealHash`, maps header number, nonce, and mix digest, and converts Core-Geth's target convention (`2^256 / difficulty`) to the C1 256-bit boundary. The test verifies a mapped header-derived C1 seal and rejects invalid header inputs. This is sufficient to define the input boundary for a future consensus-engine adapter; it is **not** a complete block-validation test or protocol activation.

### AIChain Core-Geth candidate boundary

The AIChain fork now contains [`consensus/kawpow`](../node/core-geth/consensus/kawpow), a small, disabled-by-default C1 boundary. It maps a Core-Geth header to an explicit candidate verifier input and embeds the Apache-2.0 `cpp-kawpow` reference source as a nested submodule pinned at `061d341011ca341e1f506c52b571f5fd64a0df71`. Focused tests compare its pre-seal hash to the existing Ethash implementation, reject non-positive difficulty, execute a known ProgPoW vector through the native bridge, and reject a tampered mix. On 2026-08-23, the pinned Go 1.21.13 and LLVM/MinGW toolchains passed `go test -v ./consensus/kawpow` in **4.315 seconds**.

This package does **not** implement `consensus.Engine`, engine selection, mining, genesis changes, or a network rule. The shared VPS/laptop devnet remains on its existing configuration.

The end-to-end candidate test also made two compatibility constraints concrete. The pinned reference API accepts only a signed 32-bit block number. Core-Geth's existing `2^256 / difficulty` convention is not representable in a 256-bit C1 boundary at difficulty 1; the agreed C1 testing rule therefore requires a minimum difficulty of 2. Both the candidate-only rule and explicit non-decisions are recorded in [the C1 candidate rules](phase-2a-c1-kawpow-candidate-spec.md). They must be resolved for a future protocol specification before any engine integration.

The direct CGo bridge is covered by the same height-range rule and rejects an out-of-range Go value before converting it to the reference API's C `int`. This prevents an accidental truncation path while the limitation remains unresolved.

### Header-verification performance control

On 2026-08-23, five short local control runs of the complete header-to-reference-verifier path had a median cached-epoch CPU verification time of **2.645 ms per header**, with **2,032 Go bytes** and **26 Go allocations** per operation. The matching parallel control had a 2.854 ms median but is constrained by the candidate's intentionally conservative mutex-protected one-epoch cache. These figures establish a local CPU control only; they are not mining speed, block-import throughput, sustained full-node capacity, or network TPS. Raw runs and constraints are in [the benchmark manifest](../benchmarks/pow/runs/2026-08-23-c1-core-geth-header-verifier-control.json).

GitHub Actions remain disabled on the newly created fork. They were not enabled as part of this work; enabling third-party inherited workflows is a separate repository-security decision.

## Spike rules

- Work only in an isolated Core-Geth development branch or disposable worktree.
- Start with known valid and invalid test vectors before node, miner, or throughput testing.
- Keep the candidate disabled by default and behind an explicit development-only chain configuration.
- Do not repoint the VPS or laptop devnet, change genesis, or open network services for the spike.
- Do not commit generated DAG data, keystores, `.env` files, rented-machine credentials, or raw private-devnet data.
- Compare each candidate against the same block, AVR batch, and network workload defined in the Phase 2A benchmark plan.

## Staged implementation sequence

1. Pin upstream candidate revision, licence, specification, and test-vector source in a run manifest. **C1 complete.**
2. Add a minimal verifier adapter and deterministic Go unit tests for valid, invalid, malformed, and wrong-difficulty seals. **C1 adapter, vector, tamper, cache-rotation, concurrent-use, Core-Geth header-mapping tests, and an isolated fork boundary are complete.**
3. Package the pinned native reference verifier behind the fork boundary, then measure CPU block-verification latency and memory before adding mining support. **Native-in-fork package and deterministic vector test complete; full Core-Geth block-validation measurement pending.**
4. Add development-only sealing/miner integration.
5. Use rented NVIDIA and AMD GPU environments for mining throughput, VRAM, power, and multi-node network measurements.
6. Produce a candidate comparison report; only then consider an L1-001 ADR.

## Immediate next work

The initial C1/C2/C3 source screen is complete. Established GPU-oriented candidates audited so far use bounded 32-bit height APIs; the screen recommends an explicit bounded-height migration plan instead of inventing an AIChain-specific 64-bit cryptographic variant. See [GPU PoW Source Screen](phase-2a-gpu-pow-source-screen.md). Before C2 implementation, record whether that strategy is acceptable for the candidate programme. GPU rental is still needed only for development mining and performance stages.

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Recorded consensus seam, CPU baseline, and isolated-spike rules |
| 0.2 | 2026-08-23 | Recorded AIChain-owned fork, isolated candidate boundary, local focused-test result, and intentionally disabled fork CI |
| 0.3 | 2026-08-23 | Added the pinned native C1 reference verifier within the isolated fork boundary and recorded its focused build/test result |
| 0.4 | 2026-08-23 | Added end-to-end header-derived candidate verification tests and recorded the height/target compatibility constraints they exposed |
| 0.5 | 2026-08-23 | Added five-run cached and parallel CPU header-verification controls with raw benchmark manifest |
| 0.6 | 2026-08-23 | Added direct native-bridge height-range rejection test and guard |
| 0.7 | 2026-08-23 | Recorded and enforced the agreed C1 candidate minimum difficulty and target-encoding rules |
| 0.8 | 2026-08-23 | Recorded C1 source-audit result; C1 remains a benchmark control and is not eligible for engine integration |
| 0.9 | 2026-08-23 | Added the C1/C2/C3 GPU PoW source screen and bounded-height migration recommendation |
