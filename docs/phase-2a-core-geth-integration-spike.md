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

## Spike rules

- Work only in an isolated Core-Geth development branch or disposable worktree.
- Start with known valid and invalid test vectors before node, miner, or throughput testing.
- Keep the candidate disabled by default and behind an explicit development-only chain configuration.
- Do not repoint the VPS or laptop devnet, change genesis, or open network services for the spike.
- Do not commit generated DAG data, keystores, `.env` files, rented-machine credentials, or raw private-devnet data.
- Compare each candidate against the same block, AVR batch, and network workload defined in the Phase 2A benchmark plan.

## Staged implementation sequence

1. Pin upstream candidate revision, licence, specification, and test-vector source in a run manifest. **C1 complete.**
2. Add a minimal verifier adapter and deterministic Go unit tests for valid, invalid, malformed, and wrong-difficulty seals.
3. Measure CPU block-verification latency and memory before adding mining support.
4. Add development-only sealing/miner integration.
5. Use rented NVIDIA and AMD GPU environments for mining throughput, VRAM, power, and multi-node network measurements.
6. Produce a candidate comparison report; only then consider an L1-001 ADR.

## Immediate next work

Begin C1 (ProgPoW/KawPoW family) source and test-vector pinning. The initial CPU test target is deterministic verification, not GPU performance. GPU rental is needed only at stages 4–5.

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Recorded consensus seam, CPU baseline, and isolated-spike rules |
