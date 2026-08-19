# New Dag

New Dag is an independent EVM-compatible Proof-of-Work L1 whose core product is the AI Verification Receipt layer. The product direction is a neutral verification and audit layer for autonomous AI, with a long-term ambition to serve as a trust layer for autonomous machines.

## Current Development Baseline

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
- [Development Plan](./docs/development-plan.md)
- [Development Environments](./docs/development-environments.md)
- [ADR-0001: Core-Geth Development Baseline](./docs/decisions/0001-core-geth-development-baseline.md)
