# Phase 2A Core-Geth Integration Spike

| Field | Value |
|---|---|
| Status | NVIDIA G3 network validation complete; AMD and production gates remain open |
| Version | 2.1 |
| Last updated | 2026-08-25 |
| Decision affected | L1-001 — KawPoW selected for Phase 2A development only |

## Purpose

Prepare a safe, CPU-verifiable route for KawPoW development work without
changing the shared devnet or representing the Phase 2A selection as a
production activation.

## Confirmed Core-Geth boundary

The AIChain-owned Core-Geth fork is [`loftedplacebo/core-geth`](https://github.com/loftedplacebo/core-geth). Phase 2A work is published on `new-dag-dev`; the parent repository pins that fork as its `node/core-geth` submodule source. The upstream `etclabscore/core-geth` remote remains a read-only comparison source.

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

### C2 FiroPoW CPU conformance evidence

Following acceptance of the bounded-height migration policy, the fork now
contains [`consensus/firopow`](../node/core-geth/consensus/firopow), a second
disabled-by-default boundary. It pins the official MIT-licensed
`firoorg/firo` source at `adba4310a1b118f879cb16013c669ea8b7dae01f` as a
nested submodule and runs the first official FiroPoW vector through a CPU CGo
bridge. The pinned Go 1.21.13 and LLVM/MinGW toolchain passed the positive
vector, tampered-mix rejection, and invalid-height rejection on 2026-08-23.

Firo's optional Boost-based global-context helper is intentionally not built:
the boundary owns its small, mutex-protected single-epoch light-context cache
instead. This avoids adding a Boost dependency to the candidate spike and is
not a production cache design. The source verifier API uses a signed `int`
height, so C2 rejects a height outside `0..2,147,483,647` before native
conversion. C2 has no header mapping, target conversion, `consensus.Engine`,
engine-selection, mining, genesis, or devnet call path.

### C2 CPU verification performance control

On 2026-08-23, five short warmed CPU controls of the C2 official-vector
verifier had a median serial verification time of **2.666 ms**, with **112 Go
bytes** and **1 Go allocation** per operation. The matching short parallel
control had a 2.319 ms median; it remains constrained by the deliberate
single-epoch cache mutex and is not a parallel-capacity or TPS figure.

For the same narrow local control, C1 recorded a 2.645 ms serial median. The
two figures are close enough to avoid treating verifier latency alone as a
candidate differentiator. Raw runs, scope, and exclusions are recorded in [the
C2 verifier-control manifest](../benchmarks/pow/runs/2026-08-23-c2-firopow-cpu-verifier-control.json).

## Spike rules

- Work only in an isolated Core-Geth development branch or disposable worktree.
- Start with known valid and invalid test vectors before node, miner, or throughput testing.
- Keep the candidate disabled by default and behind an explicit development-only chain configuration.
- Do not repoint the VPS or laptop devnet, change genesis, or open network services for the spike.
- Do not commit generated DAG data, keystores, `.env` files, rented-machine credentials, or raw private-devnet data.
- Compare each candidate against the same block, AVR batch, and network workload defined in the Phase 2A benchmark plan.

## Staged implementation sequence

1. Pin upstream candidate revision, licence, specification, and test-vector source in a run manifest. **C1 complete.**
2. Add a minimal verifier adapter and deterministic Go unit tests for valid, invalid, malformed, and wrong-difficulty seals. **C1 adapter, vector, tamper, cache-rotation, concurrent-use, Core-Geth header-mapping tests, and an isolated fork boundary are complete. C2 has an official vector, tamper, and range-rejection CPU boundary; header/target mapping is intentionally not started.**
3. Package the pinned native reference verifier behind the fork boundary, then measure CPU block verification before adding network mining support. **Complete through NVIDIA G3 two-node propagation, recovery, reorganisation, AVR capacity, and soak measurement.**
4. Add development-only sealing/miner integration. **Complete through the opt-in G3 harness; production integration remains gated.**
5. Use rented NVIDIA and AMD GPU environments for mining throughput, VRAM, power, and multi-node network measurements. **NVIDIA complete; AMD/OpenCL pending.**
6. Produce the production-selection report; only then consider activating the
   final L1-001 rule.

## Immediate next work

The C1/C2/C3 source screen and C2 source/vector compatibility control are
complete. Established GPU-oriented candidates audited so far use bounded
32-bit height APIs; the accepted policy requires an explicit pre-limit
consensus migration rather than an AIChain-specific 64-bit cryptographic
variant. See [GPU PoW Source Screen](phase-2a-gpu-pow-source-screen.md) and
[C2 FiroPoW Candidate Rules](phase-2a-c2-firopow-candidate-spec.md).

The C2 cached CPU control is complete and comparable with C1. The accepted
[PoW Header and Target Mapping Contract](phase-2a-pow-header-target-mapping-contract.md)
now separates candidate-neutral adapter safety rules from candidate-specific
cryptographic mapping. The C2 source review found that Firo's Bitcoin-style
header commitment and compact target cannot be silently mapped onto Core-Geth;
see [C2 FiroPoW Header-Mapping Review](phase-2a-c2-firopow-header-mapping-review.md).

KawPoW is now the Phase 2A development candidate under
[ADR-0004](decisions/0004-kawpow-phase-2a-development-selection.md). The
immediate implementation task is a disabled-by-default development-only
`consensus.Engine` design and its header/seal/difficulty test matrix. It must
not repoint the devnet, alter genesis, or add production mining support.
The CPU engine controls passed before GPU rental began; the completed rental evidence is recorded in the G1 and G2 reports.

The first disabled engine boundary is now present in the AIChain Core-Geth
fork at `consensus/kawpowengine`. It delegates only existing non-seal
structural checks, applies the isolated C1 KawPoW verifier when a seal is
requested, reports zero hashrate, and returns an explicit mining-unavailable
error from `Seal`. With the pinned MinGW runtime on the local test process
path, `go test -v ./consensus/kawpowengine` passed on 2026-08-23 in 3.883
seconds. It is not registered by chain configuration.

The focused KawPoW verifier and engine suites pass together. The wider local
Ethash regression initially exposed a Windows portability issue in
`TestEthashCaches`: the test counted temporary generation files and assumed
Unix unlink behaviour for memory-mapped caches. The test now counts only
finalized files and uses the exact Windows retention bound of on-disk caches,
in-memory mapped caches, and one future cache. The targeted test and the full
Ethash/KawPoW/KawPoW-engine regression set pass together.

The engine test matrix now also proves a valid header seal, rejects altered
mix, nonce, and difficulty, verifies that `VerifyHeader` honours its seal flag,
and demonstrates that the development difficulty helper matches Core-Geth's
existing calculation across multiple timestamp deltas. This remains an
inactive development boundary, not a production retarget rule.

The engine-level batch test preserves result order across valid, invalid, and
valid headers. A local concurrent control completed 64 valid seal checks across
16 workers, and the complete `consensus/kawpowengine` package passed Go's race
detector. These are bounded correctness controls, not sustained throughput or
denial-of-service capacity measurements.

G2 completed on 2026-08-24. The opt-in node issued a finalized block template through a local-only, rate-limited `aichain` RPC; the thin adapter translated it for the pinned RTX 3060 miner; and the node's CPU verifier accepted and imported block 1 through normal chain validation. The live test found a pending-snapshot/finalized-template mismatch, which was fixed and covered by focused and race-enabled regressions before the passing rerun. See [G2 Node-to-GPU KawPoW Interoperability](phase-2a-g2-node-gpu-interoperability.md).

G3 completed on 2026-08-25. The published fork fixed externally sealed block
broadcast and continuous downloaded-header verification, then passed separate-
host propagation, downtime catch-up, clean restart, invalid-input controls, a
controlled greater-work reorganisation, AVR load, resource sampling, and a
60-block soak. The pinned external miner's stale-job behavior required a
bounded test supervisor; production miner protocol remains **TBD**. See
[G3 Two-Node KawPoW Network Validation](phase-2a-g3-network-validation.md).

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
| 1.0 | 2026-08-23 | Recorded accepted bounded-height policy and C2 FiroPoW official-vector CPU boundary |
| 1.1 | 2026-08-23 | Added five-run C2 warmed CPU verifier control and C1 comparison evidence |
| 1.2 | 2026-08-23 | Added candidate-neutral header/target mapping contract before C2 mapping work |
| 1.3 | 2026-08-23 | Recorded C2 source-review result: Firo header/target rules require a separate AIChain design decision |
| 1.4 | 2026-08-23 | Applied the accepted EVM gate to the candidate set; no candidate may advance to engine work as-is |
| 1.5 | 2026-08-23 | Recorded ADR-0004 KawPoW Phase 2A development selection and opened disabled-by-default engine design work |
| 1.6 | 2026-08-23 | Recorded the disabled engine boundary and focused fail-closed mining test result |
| 1.7 | 2026-08-23 | Added passing KawPoW engine rejection matrix and recorded the independent local Ethash cache-cleanup baseline failure |
| 1.8 | 2026-08-23 | Resolved the Windows Ethash cache-test portability issue; full focused regression passes; added positive seal, tamper, VerifyHeader, and difficulty-equivalence tests |
| 1.9 | 2026-08-23 | Added ordered batch verification and concurrent engine controls; race-enabled package test passes |
| 2.0 | 2026-08-24 | Recorded opt-in local-only G2 RPC, bounded adapter/workers, live RTX 3060 block production, CPU verification, canonical import, and negative rejection results |
| 2.1 | 2026-08-25 | Recorded NVIDIA G3 two-node propagation, batch-sync fix, restart/reorg behavior, AVR capacity, resources, and soak evidence |
