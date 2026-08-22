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

The spike now imports the pinned Core-Geth module without modifying its source. Its mapping test derives the actual Core-Geth `SealHash`, maps header number, nonce, and mix digest, and converts Core-Geth's target convention (`2^256 / difficulty`) to the C1 256-bit boundary. The test verifies a mapped header-derived C1 seal and rejects invalid header inputs. This is sufficient to define the input boundary for a future consensus-engine adapter; it is **not** a modified client, a complete block-validation test, or protocol activation.

## Spike rules

- Work only in an isolated Core-Geth development branch or disposable worktree.
- Start with known valid and invalid test vectors before node, miner, or throughput testing.
- Keep the candidate disabled by default and behind an explicit development-only chain configuration.
- Do not repoint the VPS or laptop devnet, change genesis, or open network services for the spike.
- Do not commit generated DAG data, keystores, `.env` files, rented-machine credentials, or raw private-devnet data.
- Compare each candidate against the same block, AVR batch, and network workload defined in the Phase 2A benchmark plan.

## Staged implementation sequence

1. Pin upstream candidate revision, licence, specification, and test-vector source in a run manifest. **C1 complete.**
2. Add a minimal verifier adapter and deterministic Go unit tests for valid, invalid, malformed, and wrong-difficulty seals. **C1 adapter, vector, tamper, cache-rotation, concurrent-use, and Core-Geth header-mapping tests complete.**
3. Measure CPU block-verification latency and memory before adding mining support. **Adapter microbenchmark control complete; full Core-Geth block-validation measurement pending.**
4. Add development-only sealing/miner integration.
5. Use rented NVIDIA and AMD GPU environments for mining throughput, VRAM, power, and multi-node network measurements.
6. Produce a candidate comparison report; only then consider an L1-001 ADR.

## Immediate next work

Begin C1 (ProgPoW/KawPoW family) source and test-vector pinning. The initial CPU test target is deterministic verification, not GPU performance. GPU rental is needed only at stages 4–5.

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Recorded consensus seam, CPU baseline, and isolated-spike rules |
