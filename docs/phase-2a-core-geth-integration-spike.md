# Phase 2A Core-Geth Integration Spike

| Field | Value |
|---|---|
| Status | Active, development-only preparation |
| Version | 0.1 |
| Last updated | 2026-08-22 |
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

The AIChain fork now contains [`consensus/kawpow`](../node/core-geth/consensus/kawpow), a small, disabled-by-default C1 boundary. It maps a Core-Geth header to an explicit candidate verifier input and includes focused tests that compare its pre-seal hash to the existing Ethash implementation and reject non-positive difficulty. On 2026-08-23, the pinned Go 1.21.13 toolchain passed `go test -v ./consensus/kawpow`.

This package does **not** implement `consensus.Engine`, engine selection, mining, genesis changes, or a network rule. The shared VPS/laptop devnet remains on its existing configuration.

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
3. Package the pinned native reference verifier behind the fork boundary, then measure CPU block-verification latency and memory before adding mining support. **Adapter microbenchmark control complete; native-in-fork and full Core-Geth block-validation measurements pending.**
4. Add development-only sealing/miner integration.
5. Use rented NVIDIA and AMD GPU environments for mining throughput, VRAM, power, and multi-node network measurements.
6. Produce a candidate comparison report; only then consider an L1-001 ADR.

## Immediate next work

Bring the pinned C1 reference verifier and its conformance vectors into the fork's isolated candidate build, without connecting it to `CreateConsensusEngine`. The initial CPU target remains deterministic verification; GPU rental is needed only for development mining and performance stages.

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Recorded consensus seam, CPU baseline, and isolated-spike rules |
| 0.2 | 2026-08-23 | Recorded AIChain-owned fork, isolated candidate boundary, local focused-test result, and intentionally disabled fork CI |
