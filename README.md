# New Dag

New Dag is an independent EVM-compatible Proof-of-Work L1 whose core product is the AI Verification Receipt layer.

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

## Project Documentation

- [Core L1 Architecture and Tooling](./docs/core-l1-architecture-and-tooling.md)
- [AI Verification & ZK Architecture](./docs/ai-verification-and-zk-architecture.md)
- [Development Plan](./docs/development-plan.md)
- [ADR-0001: Core-Geth Development Baseline](./docs/decisions/0001-core-geth-development-baseline.md)
