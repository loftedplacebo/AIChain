# G3 Two-Node KawPoW Network Validation

| Field | Value |
|---|---|
| Status | **Completed — pass with development-harness limitations** |
| Document version | 0.1 |
| Last updated | 2026-08-25 |
| Scope | Phase 2A G3; disposable chain only |
| Machine-readable result | [2026-08-25 G3 result](../benchmarks/pow/runs/2026-08-25-g3-two-node-network.json) |

## Outcome

G3 demonstrated that blocks produced from node-issued work by the pinned RTX
3060 miner propagate to a separate CPU-only Core-Geth validator, are
independently verified, survive downtime and clean restarts, and follow the
greater-work branch through a controlled reorganisation. Individual and
batched AVR anchors were executed on the same network.

This closes the **NVIDIA G3 development measurement**, not the production PoW
decision. The existing Ethash devnet was not repointed or modified.

## Reproducible Boundary

- AIChain Core-Geth: `8f0886b26a489a9632d6ec29115a591e2781329a`
- Core-Geth binary SHA-256: `a4d357ff14e87ad0877ca3f5cb88b82e95aaca74d0799c9ff0563d1c45c26a92`
- External miner: `RavenCommunity/kawpowminer@632f6ea0a5cd09e2c6443374dbe6db0a767715ba`
- Miner binary SHA-256: `6e152b02f9021a33cc9704b0cfd4eb8f0a974f7bd4a7ce8a1c0905a33182f391`
- Mining RPC and adapter remained on loopback.
- P2P crossed a private SSH relay; public JSON-RPC was not exposed.
- Ephemeral keystores and passwords remained outside Git and were not copied
  into the evidence archive.

## Topology

```text
RTX 3060 miner -> loopback adapter -> GPU-host Core-Geth mining node
                                           |
                                      private P2P relay
                                           |
                                  VPS Core-Geth validator
                                  CPU only; no miner software
```

## Results

| Test | Result |
|---|---|
| Baseline propagation | Blocks 13–25; mean production 3.954 s; validator within 100 ms observation resolution |
| Sustained observation | 60 blocks, 194–254; mean production 4.014 s; no natural stale block observed |
| Final canonical audit | Both nodes at block 258 and hash `0x474c...80a1` |
| Downtime/catch-up | Validator advanced from 29 to 72 in 84.833 s end-to-end; includes manual peer delay and continued mining |
| Clean restart | Both nodes reopened block 111 with identical hash and then propagated to identical block 113 |
| Invalid input | Focused malformed peer, invalid body, tampered seal, and discontinuous-header tests passed |
| Controlled fork | Fork and main diverged at block 114; validator first adopted fork tip 118 |
| Reorganisation | Validator switched to main tip 123 in 5.274 s after main accumulated greater work |
| CPU verification | 186 imports; 22.14 ms mean; 44.66 ms p95; 555.04 ms maximum |

The forced fork produced five stale branch blocks. Its 33.3% stale fraction is
an intentionally adversarial scenario, not an estimate of natural network
orphan rate. The 60-block soak observed zero natural stale blocks; the sample
is too small for a production orphan-rate claim.

## AVR Capacity

| Workload | Transactions | Logical receipts | Confirmed transaction TPS | Confirmed logical receipt TPS |
|---|---:|---:|---:|---:|
| Individual AVR anchors | 50 | 50 | 1.059 | 1.059 |
| Batch size 1 control | 50 | 50 | 1.191 | 1.191 |
| Batch size 10 | 10 | 100 | 0.759 | 7.589 |
| Batch size 100 | 1 | 100 | 0.278 | 27.755 |
| Batch size 1,000 | 1 | 1,000 | 0.218 | 217.659 |

The batch-1,000 broadcast rate was 1,257.93 logical receipts/s, while its
all-confirmed rate was 217.66/s. These are controlled development results,
not public-network capacity claims. They confirm that application batching is
necessary to separate receipt throughput from base-chain transaction rate.

## Five-Minute Resource Sample

| Metric | GPU mining node | CPU-only validator |
|---|---:|---:|
| Mean CPU, percent of one core | 2.17% | 1.21% |
| p95 CPU, percent of one core | 5.71% | 4.94% |
| Maximum RSS | 124.9 MB | 109.0 MB |
| Data-directory growth | 172 KB | 143 KB |
| Network received | 269 KB | 278 KB |
| Network sent | 326 KB | 199 KB |
| Mean GPU utilization | 67.24% | Not applicable |
| Mean GPU power | 101.48 W | Not applicable |
| Maximum GPU memory | 1,154 MiB | Not applicable |

These figures cover the AVR load period on a short, low-volume disposable
chain. They do not size production nodes.

## Defects Found and Resolved

1. Externally sealed blocks entered the local chain but initially did not emit
   the normal mined-block event. The node now broadcasts them through the
   standard event path, with regression coverage.
2. Batch header verification checked every downloaded header against only the
   committed chain tip, producing `unknown ancestor` after the first header.
   The development engine now delegates the continuous structural batch and
   applies KawPoW seal checks in result order.
3. The G3 launcher treated the persistent database `LOCK` path as proof of a
   live process. Core-Geth now performs its own authoritative lock check.
4. The pinned external miner retains solved jobs longer than this dev RPC
   workflow expects. The G3 supervisor restarts only that miner after each
   accepted height and uses bounded shutdown escalation. This is a harness
   workaround; production miner protocol and packaging remain **TBD**.

## Open Gates

- AMD/OpenCL G1 and interoperable mining repeat remain open.
- Production difficulty, retargeting, target block interval, confirmation
  policy, reward rules, pool protocol, and economics remain **TBD**.
- A longer multi-host public testnet soak and network-partition campaign remain
  required before production consideration.
- Natural stale/orphan rate, bandwidth at scale, state growth, and denial-of-
  service capacity require larger workloads and more peers.
- Quantum-threat assessment and account-signature migration remain separate
  required work; G3 makes no quantum-resistance claim.
- Final production selection **L1-001** remains open.

## Evidence Retention

The non-secret raw archive is retained locally outside Git at
`C:\AIChain-G3-Results\2026-08-25-two-node-kawpow`. Its generated
`evidence-summary.json` contains file SHA-256 hashes. Large logs, runtime chain
state, passwords, and keystores are intentionally not committed.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-25 | Recorded two-node propagation, sync/restart, rejection, reorg, AVR, resource, and soak results |
