# Orvessian / AIChain verification engineering

## Current launch direction — Base

On 20 September 2026 the founder accepted launching the verification product on Base, with larger/hierarchical receipt batching evaluated before further own-consensus work. Read [ADR-0009](./docs/decisions/0009-base-launch-settlement.md) and the [Base transition audit and B0–B6 roadmap](./docs/base-transition-audit-and-roadmap.md) first.

Reuse the contracts, SDKs, profiles, audit tools and selected proof path here. The own-PoW node/miner material below is historical research and development evidence, not the launch critical path. The separately versioned website stays in place. No Base production deployment is implied.

## Commercial product strategy review

The proposed SDK/API, evidence-platform and business roadmap is linked from the
[commercialisation review handoff](./docs/commercialisation-review-handoff.md).
It provides the business context. ADR-0009 and the Base transition roadmap now
own launch sequencing; historical receipt semantics and experiment records remain preserved.

The project originated as an independent EVM-compatible Proof-of-Work L1. Its current product is a verification and audit layer for selected AI activity, with Base as the accepted launch settlement destination.

## Verification receipt developers

Start with the [general receipt developer guide](./docs/verification-receipt-developer-guide.md)
and `node examples/verification-receipt.js`. The additive `0.4.0-alpha` format
supports application-defined evidence, AI and machine profiles, private evidence
openings, signatures, batching and receipt links. Existing authorized AVR/ZK-001
flows retain their original format. See the
[readiness review](./docs/verification-receipt-readiness-review.md) for coverage,
verification limits and remaining public-release work.

## Current Development Baseline

See [Phase 3 integrated alpha](./docs/phase-3-integrated-alpha.md) for the
reproducible receipt, authority, proof, batching and lookup demonstration,
measured results and remaining release gates.

- Core-Geth submodule: `node/core-geth`
- Upstream release: `v1.12.23`
- Pinned commit: `96b2afc`
- Local development branch: `new-dag-dev`

This pin is a development baseline only. It does not select the final mining algorithm, chain parameters, coin economics, AVR schema, or ZK stack.

## Local Setup

```powershell
git submodule update --init --recursive
.\scripts\bootstrap-go.ps1
.\scripts\bootstrap-cgo-toolchain.ps1
.\scripts\build-core-geth.ps1
```

To run the upstream test suite after the build succeeds:

```powershell
.\scripts\build-core-geth.ps1 -RunTests
```

The local Go toolchain, Go caches, build outputs, and future devnet state are intentionally ignored by Git.

## Repository and Development Environment

- Public source repository: [loftedplacebo/AIChain](https://github.com/loftedplacebo/AIChain)
- Remote development node: documented in [Development Environments](./docs/development-environments.md)

The remote node is for the private development network only. Its JSON-RPC endpoint must remain bound to localhost; use an SSH tunnel for remote access. Do not commit credentials, private keys, keystores, or node data.

## Development Devnet

The committed genesis file and helper scripts create a deliberately temporary Ethash PoW network for Phase 1A validation. This is not the final mining-algorithm decision and is not a public testnet.

See [Development Environments](./docs/development-environments.md) for the initialization, local-node, VPS-node, and SSH-tunnel workflows.

## Project Documentation

- [Core L1 Architecture and Tooling](./docs/core-l1-architecture-and-tooling.md)
- [AI Verification & ZK Architecture](./docs/ai-verification-and-zk-architecture.md)
- [Autonomous Machines Product Vision](./docs/autonomous-machines-product-vision.md)
- [AVR Prototype Specification](./docs/avr-prototype-specification.md)
- [Identity and Authority Prototype](./docs/identity-and-authority-prototype.md)
- [Development Plan](./docs/development-plan.md)
- [Capacity and Batching Prototype](./docs/capacity-and-batching-prototype.md)
- [Development Environments](./docs/development-environments.md)
- [Blockscout Compatibility Spike](./docs/blockscout-compatibility-spike.md)
- [Phase 2A PoW Candidate Shortlist](./docs/phase-2a-pow-candidate-shortlist.md)
- [Phase 2A Core-Geth Integration Spike](./docs/phase-2a-core-geth-integration-spike.md)
- [Phase 2A KawPoW Engine Design](./docs/phase-2a-kawpow-engine-design.md)
- [Phase 2A KawPoW GPU and Miner Gate](./docs/phase-2a-kawpow-gpu-miner-gate.md)
- [Phase 2A KawPoW Development Work Protocol](./docs/phase-2a-kawpow-development-work-protocol.md)
- [ADR-0001: Core-Geth Development Baseline](./docs/decisions/0001-core-geth-development-baseline.md)
- [ADR-0003: EVM-Native PoW Header Compatibility (Proposed)](./docs/decisions/0003-evm-native-pow-header-compatibility.md)
- [ADR-0004: KawPoW Phase 2A Development Selection](./docs/decisions/0004-kawpow-phase-2a-development-selection.md)
