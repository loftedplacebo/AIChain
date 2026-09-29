# Orvessian / AIChain verification engineering

## Current platform

Start with the [seven active guides](docs/README.md), [architecture](docs/platform-architecture.md), [roadmap](docs/roadmap-and-decisions.md) and [operations runbook](docs/operations-runbook.md). The governance workspace, structured API, signed receipts and sponsored Base Sepolia batches form a private synthetic pilot. Production access remains gated.

Base is the accepted launch direction: [ADR-0009](docs/decisions/0009-base-launch-settlement.md). No own-L1, separate L2 or native token is required. The own-chain setup below is historical research. [Archived planning](docs/archive/README.md) preserves its evidence.

## Verification receipt developers

Start with the [general receipt developer guide](./docs/verification-receipt-developer-guide.md)
and `node examples/verification-receipt.js`. The additive `0.4.0-alpha` format
supports application-defined evidence, AI and machine profiles, private evidence
openings, signatures, batching and receipt links. Existing authorized AVR/ZK-001
flows retain their original format. See the
[readiness review](./docs/verification-receipt-readiness-review.md) for coverage,
verification limits and remaining public-release work.

## Historical own-chain development baseline

See [Phase 3 integrated alpha](docs/archive/2026-09-27/completed-stages/phase-3-integrated-alpha.md) for the
reproducible receipt, authority, proof, batching and lookup demonstration,
measured results and remaining release gates.

- Core-Geth submodule: `node/core-geth`
- Upstream release: `v1.12.23`
- Pinned commit: `96b2afc`
- Local development branch: `new-dag-dev`

This pin is a development baseline only. It does not select the final mining algorithm, chain parameters, coin economics, AVR schema, or ZK stack.

## Historical node research setup

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
- Remote development node: documented in [Development Environments](docs/archive/2026-09-27/own-chain/development-environments.md)

The remote node is for the private development network only. Its JSON-RPC endpoint must remain bound to localhost; use an SSH tunnel for remote access. Do not commit credentials, private keys, keystores, or node data.

## Development Devnet

The committed genesis file and helper scripts create a deliberately temporary Ethash PoW network for Phase 1A validation. This is not the final mining-algorithm decision and is not a public testnet.

See [Development Environments](docs/archive/2026-09-27/own-chain/development-environments.md) for the initialization, local-node, VPS-node, and SSH-tunnel workflows.

## Project Documentation

- [Core L1 Architecture and Tooling](docs/archive/2026-09-27/own-chain/core-l1-architecture-and-tooling.md)
- [AI Verification & ZK Architecture](./docs/ai-verification-and-zk-architecture.md)
- [Autonomous Machines Product Vision](docs/archive/2026-09-27/superseded-plans/autonomous-machines-product-vision.md)
- [AVR Prototype Specification](./docs/avr-prototype-specification.md)
- [Identity and Authority Prototype](./docs/identity-and-authority-prototype.md)
- [Development Plan](docs/archive/2026-09-27/superseded-plans/development-plan.md)
- [Capacity and Batching Prototype](./docs/capacity-and-batching-prototype.md)
- [Development Environments](docs/archive/2026-09-27/own-chain/development-environments.md)
- [Blockscout Compatibility Spike](./docs/blockscout-compatibility-spike.md)
- [Phase 2A PoW Candidate Shortlist](docs/archive/2026-09-27/own-chain/phase-2a-pow-candidate-shortlist.md)
- [Phase 2A Core-Geth Integration Spike](docs/archive/2026-09-27/own-chain/phase-2a-core-geth-integration-spike.md)
- [Phase 2A KawPoW Engine Design](docs/archive/2026-09-27/own-chain/phase-2a-kawpow-engine-design.md)
- [Phase 2A KawPoW GPU and Miner Gate](docs/archive/2026-09-27/own-chain/phase-2a-kawpow-gpu-miner-gate.md)
- [Phase 2A KawPoW Development Work Protocol](docs/archive/2026-09-27/own-chain/phase-2a-kawpow-development-work-protocol.md)
- [ADR-0001: Core-Geth Development Baseline](./docs/decisions/0001-core-geth-development-baseline.md)
- [ADR-0003: EVM-Native PoW Header Compatibility (Proposed)](./docs/decisions/0003-evm-native-pow-header-compatibility.md)
- [ADR-0004: KawPoW Phase 2A Development Selection](./docs/decisions/0004-kawpow-phase-2a-development-selection.md)
