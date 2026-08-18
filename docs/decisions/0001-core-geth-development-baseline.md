# ADR-0001: Core-Geth Development Baseline

| Field | Value |
|---|---|
| Status | Accepted for development |
| Date | 2026-08-18 |
| Decision ID | L1-002 (baseline-selection portion) |
| Source | `etclabscore/core-geth` `v1.12.23` |
| Pinned commit | `96b2afc` |
| Local source path | `node/core-geth` Git submodule |

## Context

The project requires an independent, EVM-compatible Proof-of-Work L1 built from a Core-Geth fork. Upstream go-ethereum no longer maintains the PoW code path needed for this direction, while Core-Geth retains and maintains PoW-oriented functionality.

The node baseline must be pinned before development begins so builds, tests, reviews, and future upstream-security updates have a known reference point.

## Decision

Use the signed Core-Geth `v1.12.23` release at commit `96b2afc` as the **development baseline**. The source is tracked as the `node/core-geth` submodule.

Development changes will be made on a dedicated local branch from this pinned commit after baseline validation. The upstream remote is a source of security and compatibility updates; it is not a release target for this project.

## Why This Baseline

- It matches the agreed Go, EVM, and PoW architecture.
- It provides an Ethereum-compatible client and JSON-RPC starting point.
- It retains a maintained PoW code path where upstream Geth no longer does.
- The release tag and commit are signed, allowing the source baseline to be verified.

## Not Decided by This ADR

- GPU-friendly PoW algorithm or its quantum-resilience design (**L1-001**).
- Chain ID, genesis, block timing, gas parameters, or native-coin economics (**L1-003**, **L1-004**).
- AVR schema, anchoring location, attestations, privacy model, or AI-specific RPC methods.
- ZK statements, stack, verifier, aggregation, or upgrade model.
- A chain-wide post-quantum signature or wallet migration strategy.
- The complete boundary of protocol changes required by this fork.

## Consequences and Follow-Up

- Baseline builds, EVM behavior, and standard JSON-RPC behavior must be tested before protocol changes are introduced.
- ETC-specific configuration, discovery, bootnode, and network assumptions must not be inherited into the new chain without an explicit decision.
- A repeatable upstream security-review and patch process is required before any public network.
- The baseline-selection portion of **L1-002** is complete; the required protocol-change boundary remains **TBD**.

## References

- [Core-Geth repository](https://github.com/etclabscore/core-geth)
- [Core-Geth v1.12.23 release](https://github.com/etclabscore/core-geth/releases/tag/v1.12.23)
