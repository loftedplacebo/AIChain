# Phase 4 — Closed-testnet deployment foundation

Version: 0.1.0-draft · Updated: 2026-09-08 · Status: pre-provisioning

## Purpose and boundary

This document defines the minimum reproducible deployment and operations
foundation for a **closed** AIChain testnet. It prepares Phase 4; it does not
launch one. It does not change the existing development network, expose public
JSON-RPC, select final mainnet parameters, issue a value-bearing asset, or
settle KawPoW as mainnet consensus.

The closed-testnet candidate is the reviewed KawPoW development profile. Final
difficulty, target block interval, rewards, supply, fees, chain ID, genesis
allocations, operator identities and public-network policy remain **TBD** and
require explicit release approval.

## Target topology

```text
        Miner A (NVIDIA) ─┐
        Miner B (AMD) ────┼── authenticated P2P overlay ── Validator A
        Miner C (independent) ─┘                            Validator B
                                      │                         │
                                      ├── restricted telemetry ──┤
                                      │
                              private RPC gateway
                                      │
                     AVR ingress / prover queue / indexer
                                      │
                           private Blockscout deployment
```

Roles are separated deliberately:

| Role | Minimum | May mine? | RPC exposure | Primary responsibility |
|---|---:|---:|---|---|
| GPU miners | 3 independent operators, including NVIDIA and AMD | Yes | Loopback/private only | Block production and competing-work evidence |
| Validators | 2 operators | No | Loopback/private only | Independent block validation, sync and reorg evidence |
| Ingress/indexer | 1+ | No | Private gateway only | AVR batching, durable indexing and explorer references |
| Monitoring | 1+ independent collector | No | Private telemetry only | Metrics, alerts and evidence retention |
| Release operator | 2-person control recommended | No | No node RPC required | Approved genesis, reset and upgrade execution |

No host is trusted merely because it is an operator. Miner work, block
validation, receipt authorization, proof verification and indexer state are
separate checks.

## Pre-provisioning release manifest

Copy [`../config/closed-testnet.env.example`](../config/closed-testnet.env.example)
to an ignored local `config/closed-testnet.env`. Fill it only after release
approval, then validate it:

```bash
bash scripts/validate-closed-testnet-plan.sh config/closed-testnet.env
```

The manifest intentionally contains no private key, password, RPC credential,
cloud token, IP address or genesis allocation. It rejects placeholders, public
RPC, missing monitoring, fewer than three miner operators, fewer than two
validators, or fewer than two regions. Passing it proves configuration
completeness—not that a network is secure or launched.

## Reproducible deployment sequence

1. **Approve the manifest.** Record the reviewed Core-Geth commit, KawPoW
   source/adapter revision, genesis digest, contract artifacts, host inventory
   and the exact runbook version in a non-secret release record.
2. **Build and verify artifacts.** Each operator builds from the tagged source,
   checks binary/artifact hashes and verifies the approved genesis digest before
   starting a node. A mismatch is a hard stop.
3. **Provision private connectivity.** Admit P2P peers with authenticated
   operator-controlled relays or equivalent private networking. Bind node RPC
   to loopback/private interfaces only; the closed testnet has no public RPC.
4. **Start validators first.** Initialize from the same approved genesis and
   establish P2P links. Record peer IDs, head/genesis identity and baseline
   resource metrics.
5. **Start miners one at a time.** Confirm each GPU adapter obtains work, CPU
   verification accepts a submitted solution, and validators independently
   accept the block. Do not enable a miner that cannot be independently
   observed by a validator.
6. **Deploy alpha contracts and sidecars.** Use disposable test accounts only;
   retain contract addresses, artifact hashes and schema/proof versions in the
   release record.
7. **Enable ingestion and explorer views.** Keep AI RPC opt-in and private.
   Check indexer chain/genesis binding before exposing any lookup endpoint.
8. **Execute the acceptance matrix.** Run load, partition, reorg, restart,
   malformed transaction/proof, queue backpressure and recovery exercises.
9. **Publish a reviewed closed-testnet report.** Publish safe aggregate metrics
   and limitations only. Keep credentials, private evidence, IPs and raw logs
   access-controlled.

## Reset and upgrade discipline

### Reset

A reset is a new testnet epoch, not a database deletion in place:

1. approve a new genesis and assign a new chain/network ID;
2. archive public-safe evidence and inventory the old artifacts;
3. stop all nodes through the incident/change record;
4. revoke private gateway credentials and retire the old operator allow-list;
5. initialize new datadirs from the new digest; and
6. re-run genesis, P2P and independent-validation checks before accepting AVR
   traffic.

Never reuse a datadir, signer or public test allocation across reset epochs.

### Upgrade

Before an upgrade, rehearse it on an isolated clone with the same role split.
The upgrade record must identify the source tag, build hashes, contract/schema
versions, migration steps, rollback boundary and indexer rebuild procedure.
If state or consensus compatibility is uncertain, use a reset epoch rather than
claiming an in-place upgrade is safe.

## Initial operations controls

| Control | Closed-testnet requirement |
|---|---|
| JSON-RPC | loopback or authenticated private gateway; no public listener |
| P2P | allow-listed/private admission, operator inventory, peer-count alert |
| Keys | role-separated, encrypted, never committed; disposable test funds only |
| Evidence | public-safe aggregates separated from restricted raw logs/evidence |
| Monitoring | independent head, peer, reorg, block-time, orphan, resource, queue, index and proof-cost signals |
| Backups | encrypted datadir/config backups with restoration rehearsal; never treat a backup as a consensus fork override |
| Incident response | pause ingress first; preserve evidence; do not silently reset or rewrite history |

## Phase 4 entry checklist

- [ ] Real Phase 3 delayed verifier-governance activation has passed and is recorded.
- [ ] Closed-testnet release manifest passes validation.
- [ ] Three independent GPU miners are available, with at least one AMD/OpenCL
  and one NVIDIA implementation.
- [ ] Two non-mining validator operators are available across two regions.
- [ ] Genesis, source/artifact hashes and contract release record are approved.
- [ ] Private P2P/RPC/telemetry connectivity has been reviewed.
- [ ] Monitoring, alerting, reset and upgrade rehearsal owners are named.
- [ ] Capacity, spam, fee and confirmation acceptance thresholds are approved.

## Explicitly deferred

- Public testnet, public RPC, faucet or user onboarding.
- Final mainnet consensus, chain ID, economics, issuance and mining rewards.
- Stablecoin, canonical bridge or any value-bearing bridge.
- Claims of ASIC resistance, quantum resistance, production TPS or finality.
- Production security approval; independent review remains required.

## Interim single-GPU rehearsal

While the required AMD and additional independent miners are unavailable, run
the scoped [single-GPU / dual-validator rehearsal](./phase-4-single-gpu-rehearsal.md).
It produces useful synchronization, recovery, AVR/proof and monitoring evidence
without misrepresenting the result as closure of the full hardware-diversity
gate.

## Next implementation increment

The measurement and fault-test harness is now drafted in
[Phase 4 Measurement and fault-test harness](./phase-4-measurement-and-fault-harness.md).
It validates controlled plans and produces review-required evidence reports,
but does not start a network or execute faults automatically.
