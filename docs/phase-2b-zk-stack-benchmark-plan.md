# Phase 2B ZK Stack Benchmark Plan

| Field | Value |
|---|---|
| Status | Ready for implementation |
| Workload | ZK-001 policy evaluation `0.1.0-draft` |
| Candidates | RISC Zero, SP1, Halo2 |
| Last updated | 2026-08-28 |

## Purpose

Compare proof systems using the same claim, fixture, public inputs, host hardware, and acceptance tests. No candidate is selected by this plan.

## Required Candidate Prototype

Each viable candidate must:

1. consume the shared private witness and public metadata;
2. reproduce the golden public inputs exactly;
3. generate and verify an individual proof;
4. reject modified action, policy, result, receipt, root, identity, timestamp, and program version;
5. expose a reproducible command and machine-readable report; and
6. document toolchain versions, trusted setup assumptions, licenses, and verifier/upgrader trust.

Halo2 may be excluded after a documented implementation-effort spike if expressing the statement as a bespoke circuit is disproportionate. Exclusion is not a stack-selection decision.

## Measurements

Run five warm-ups and at least ten measured proofs per candidate on the same machine. Record median, p95, minimum, and maximum where applicable:

- host proving time and peak memory;
- proof and public-input byte sizes;
- local verification time;
- Solidity verifier deployment bytecode and gas;
- successful verification gas;
- invalid-proof and wrong-public-input behavior;
- recursion/aggregation capability and expected overhead;
- build time, artifact size, dependency count, and integration complexity; and
- audit maturity, release cadence, upgrade model, and operational maintenance burden.

## Acceptance Gate

A recommendation requires reproducible results, exact golden-vector agreement, all negative vectors passing, a disposable EVM-chain verifier demonstration, and an explicit assurance/privacy review. The recommendation must separate measured facts from engineering judgment and keep ZK-003 aggregation scope explicit.

