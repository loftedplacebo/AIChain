# Phase 2A PoW Candidate Shortlist and Benchmark Plan

| Field | Value |
|---|---|
| Status | Active evaluation — **no algorithm selected** |
| Version | 0.1 |
| Last updated | 2026-08-22 |
| Decision affected | L1-001: final mining algorithm and quantum-resilience assessment |
| Supersedes | Nothing; implements the first Track A deliverable in the Phase 2 Evaluation Charter |

## Decision boundary

AIChain is an independent PoW L1. This document defines what Phase 2A will test; it does **not** choose an algorithm, final network parameters, reward economics, or launch hardware policy. Ethash remains development-only.

The network will have one base consensus work function. It will not launch with separate CPU and GPU mining algorithms or a hardware-class quota. Such a split would add difficulty-adjustment, security-budget, and attack-surface complexity before the network has evidence it needs it.

## Compatibility position

| Activity | CPU | GPU | Position |
|---|---|---|---|
| Run a full node; validate blocks, EVM execution, AVR anchors, and proofs | Required | Optional | Every ordinary node must be able to verify consensus without a GPU. |
| Produce blocks / mine | Technically possible only where a candidate implementation supports it; not a target | Primary target | The evaluation targets broad consumer/professional GPU participation. CPU mining is not expected to be economically competitive. |
| AI or enterprise workload | Optional | Optional | Providers may mine with available GPUs and separately offer verified AI work. Neither role receives special consensus rights. |

This means AIChain is **CPU-compatible for participation and verification, GPU-targeted for mining**. It does not promise profitable CPU mining. A GPU-targeted line better fits the intended AI-provider ecosystem while avoiding a design that relies on CPU fleets or browser/botnet-style mining.

## Candidate set

### C0 — Ethash development baseline

Use the existing development engine only as a control: it supplies known node behaviour and a baseline for validation, propagation, and AVR-batch measurements. It is **not** a launch candidate. Ethereum described Ethash as memory-hard and intended to reduce ASIC advantage, but that is not a guarantee of permanent ASIC resistance ([Ethereum Ethash documentation](https://ethereum.org/developers/docs/consensus-mechanisms/pow/mining/mining-algorithms/ethash/)).

### C1 — ProgPoW / KawPoW family (leading integration candidate)

This is the leading **family** to benchmark, not a decision. ProgPoW was specified as a GPU-oriented PoW design ([EIP-1057](https://eips.ethereum.org/EIPS/eip-1057)). KawPoW is a deployed derivative with a public miner supporting NVIDIA CUDA and OpenCL; that is useful evidence for cross-vendor GPU operability, not a security endorsement ([KawPoW miner reference implementation](https://github.com/RavenCommunity/kawpowminer)).

**Why test it first:** closest fit to the project’s EVM/Core-Geth lineage, known GPU toolchain, cheap verification, and existing GPU mining implementations.

**What could reject it:** unacceptable Core-Geth integration risk; validation or propagation cost; poor performance across the selected GPU matrix; credible specialised-hardware advantage; security/audit concerns; or an unsuitable licensing/maintenance posture.

### C2 — Autolykos v2 (independent GPU-memory-hard comparator)

Autolykos v2 is a memory-hard PoW used by Ergo. Ergo describes it as GPU-oriented, with efficient implementations using substantial VRAM, and reports that the v2 upgrade enabled conventional pool mining ([Ergo Autolykos documentation](https://docs.ergoplatform.com/mining/autolykos/); [Ergo implementation history](https://github.com/ergoplatform/ergo/wiki/Mining-Ergo-before-The-Hardening-Upgrade)).

**Why test it:** it provides a materially different GPU-friendly memory-hard comparison rather than merely another ProgPoW variant.

**What could reject it:** larger implementation delta from Core-Geth, less suitable validation or DAG/memory behaviour, weak multi-vendor tooling evidence, or security/operational trade-offs compared with C1.

### Excluded from initial consensus shortlist

| Option | Reason for exclusion now |
|---|---|
| RandomX / CPU-targeted PoW | RandomX is intentionally optimised for general-purpose CPUs ([RandomX reference project](https://github.com/tevador/RandomX)). That is a valid design for other networks, but conflicts with AIChain’s GPU-targeted mining objective. It remains a **control concept**, not an implementation candidate. |
| Proof-of-AI / proof-of-useful-work | Kept for later product-market research above the L1, not block consensus. See [Phase 2A Consensus Recommendation](./phase-2a-consensus-recommendation.md). |
| ASIC-first PoW | Not aligned with the project’s desired broad GPU participation or early supply-chain decentralisation. |
| Additional ProgPoW derivatives | Do not add superficially different variants until C1 demonstrates a meaningful limitation; they would dilute the initial evaluation. |

## Quantum posture

No candidate may be labelled “quantum resistant” solely because it is memory-hard or GPU-friendly. For a hash-based PoW, the Phase 2A question is the work-function security margin and any quantum search advantage; for the current EVM account model, the more urgent migration concern is quantum-vulnerable public-key signatures.

The initial posture is therefore **crypto-agility**, not a premature claim of quantum safety:

- retain a consensus algorithm transition path, test vectors, activation process, and rollback plan;
- inventory current signature, hash, key-management, and ZK dependencies separately;
- design future account/signature migration as a dedicated protocol track; and
- reassess NIST-standardised post-quantum signature options when an EVM-compatible account-migration design is in scope. NIST identifies ML-DSA and SLH-DSA as standardised post-quantum digital-signature options ([NIST PQC project](https://csrc.nist.gov/Projects/Post-Quantum-Cryptography)).

This leaves L1-001 open. It prevents a misleading claim that choosing a GPU algorithm alone solves the quantum problem.

## Reproducible benchmark specification

### Environment manifest

Record, for every run:

- candidate name, upstream revision, local patch hash, build flags, licence, and test-vector source;
- Core-Geth revision and any consensus/client patch;
- OS, kernel, driver, compiler/runtime, CPU, RAM, storage, and network conditions;
- at least one NVIDIA CUDA and one AMD OpenCL-capable GPU where available; VRAM, clocks/power settings, driver versions, and measured wall power;
- node count, topology, latency/loss profile, block target, gas limit, difficulty configuration, and clock source; and
- AVR batch fixture, receipt sizes, total logical receipts, submitter concurrency, confirmation definition, warm-up, and failure conditions.

Hardware access is an evaluation constraint, not a reason to extrapolate. If an AMD or NVIDIA result is unavailable, the report must say so rather than infer cross-vendor performance.

### Measurements

| Area | Measurements |
|---|---|
| Mining accessibility | Hashrate, joules/work, VRAM requirement, setup reproducibility, and NVIDIA/AMD variance |
| Node cost | Block-validation latency, peak memory, CPU load, bandwidth, disk effect, and verifier/miner asymmetry |
| Network health | Block propagation, stale/orphan rate, reorganisation depth/frequency, and confirmation distribution |
| AVR capacity | Broadcast and all-confirmed logical receipt throughput at fixed batch sizes; gas and block-space use |
| Security/centralisation | ASIC/FPGA feasibility review, pool and hardware-supply assumptions, 51% attack-cost model, timestamp/difficulty and DoS analysis |
| Upgrade safety | Test vectors, bad-block rejection, activation/rollback rehearsal, and client compatibility |

### First integration spike

1. Freeze C1 and C2 upstream revisions and obtain/verify their published test vectors.
2. Implement each candidate behind a development-only consensus flag in a disposable Core-Geth branch or isolated harness—never on the shared devnet without an approved migration plan.
3. Prove deterministic valid/invalid block verification with Go tests before performance testing.
4. Run one-node and multi-node benchmarks using the same AVR batch fixtures used in Phase 1B.
5. Publish raw manifests and an interpretation report. Do not compare headline hash rates across algorithms as if they were equivalent security units.

## Selection gate

L1-001 can proceed to an ADR only if one candidate completes the full benchmark and security packet and has a documented transition plan. The ADR must state:

- algorithm revision and consensus parameters;
- why the selected design beats each evaluated alternative for AIChain’s stated goals;
- expected CPU/full-node and GPU/miner participation model;
- ASIC and cloud/GPU-provider concentration assumptions;
- quantum-threat assumptions and signature-migration dependencies; and
- activation, rollback, and future-algorithm-transition conditions.

Until then, the correct external statement is: **AIChain is evaluating GPU-targeted PoW; the final algorithm is TBD.**

## Change log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Initial candidate shortlist and reproducible benchmark plan |
