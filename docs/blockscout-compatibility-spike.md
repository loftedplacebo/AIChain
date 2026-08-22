# Blockscout Compatibility Spike

| Field | Value |
|---|---|
| Status | Phase 1A compatibility assessment |
| Document version | 0.1 |
| Last updated | 2026-08-22 |
| Scope | Private development-network explorer only |
| Decision state | No explorer deployment or public exposure has been selected |

## 1. Purpose

Assess whether a Blockscout deployment can index the private EVM-compatible development network without changing its RPC privacy boundary or interfering with existing VPS services. This is an integration spike, not an endorsement of a production explorer architecture.

## 2. Observed VPS Preconditions

| Check | Observed result | Implication |
|---|---|---|
| Docker engine | Installed | Containerized evaluation is feasible |
| Available memory | Approximately 45 GiB | Sufficient for a constrained development spike |
| Available disk | Approximately 227 GiB | Sufficient for a development database and index data, subject to monitoring |
| Node RPC | Node 1 at `127.0.0.1:8545` | Explorer must preserve localhost-only RPC access |
| Host PostgreSQL | Already listening on `127.0.0.1:5432` | Do not bind a Blockscout database to the default host port or alter the existing service |
| Public explorer port | Unallocated at assessment time | Any future UI exposure is a separate firewall and access-control decision |

## 3. Safe Evaluation Boundary

A future spike may run Blockscout and a **separate** PostgreSQL database in an isolated container network, with the database port unexposed on the host. The explorer should access Node 1 through a localhost-preserving configuration and should initially bind any UI to loopback or an authenticated reverse proxy.

Before deployment, record the exact Blockscout release/image digest, its Core-Geth JSON-RPC compatibility result, resource limits, volume/reset policy, and selected UI access model. Public exposure remains **TBD**.

## 4. Acceptance Checks

- Index chain ID `20260818`, blocks, transactions, and receipts from Node 1.
- Display the AVR anchor and batch-anchor contract events as ordinary EVM logs.
- Remain functional after node recovery and peer reconnection.
- Do not expose node JSON-RPC or database ports publicly.

## 5. Open Decisions

| ID | Decision | Status |
|---|---|---|
| EXP-001 | Blockscout version/image and compatibility result | TBD |
| EXP-002 | Explorer UI access model and authentication | TBD |
| EXP-003 | Indexer retention, reset, backup, and monitoring model | TBD |
| EXP-004 | Receipt-specific indexing/display beyond ordinary EVM events | TBD |

## 6. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-22 | Initial VPS compatibility assessment and safe evaluation boundary |
