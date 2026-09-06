# Phase 2C: Repeated ZK Benchmark Results

| Field | Value |
| --- | --- |
| Status | Complete evidence for ZK-002 decision |
| Evidence date | 2026-08-29 |
| Decision recorded | 2026-09-06 |
| Workload | ZK-001 private policy evaluation `0.1.0-draft` |
| Fixture | `fixtures/zk/policy-evaluation-v0.1.0-draft.json` |
| Host | 12-vCPU AMD EPYC virtual machine, 47 GiB RAM |
| Protocol | Five warm-ups, then ten serial measurements per candidate |

## Controlled comparison

Both candidates produced an on-chain-verifiable proof for the same private
witness and the same 714-byte public values. Every measurement bound to this
receipt ID:

`0xde239d25bc76016b92256da94013ca347646522ea4faf7fbe57e22c6ec42b316`

The commands, bounded machine-readable summary, and harness are versioned in
the repository. The harness intentionally runs serially: these numbers are
single-prover latency and memory evidence, not network throughput or a
capacity claim.

## Measured results

| Measurement | RISC Zero 3.0.3 | SP1 6.5.0 |
| --- | ---: | ---: |
| Proof bytes | 260 | 356 |
| Public values | 714 bytes | 714 bytes |
| Proof time, minimum | 149.003 s | 422.580 s |
| Proof time, median | **152.920 s** | **433.613 s** |
| Proof time, p95 | 161.234 s | 458.516 s |
| Proof time, maximum | 161.234 s | 458.516 s |
| Wrapper wall time, median | 155.340 s | 462.700 s |
| Peak RSS, median | 4,798,936 KiB (~4.6 GiB) | 18,302,492 KiB (~17.5 GiB) |
| Peak RSS, p95 | 4,799,552 KiB (~4.6 GiB) | 18,684,520 KiB (~17.8 GiB) |

RISC Zero's median proof time was about 2.8 times lower, its median peak
memory was about 3.8 times lower, and its proof was 96 bytes smaller for this
controlled workload. The earlier EVM trial also measured lower RISC Zero
verification gas (250,152 versus 263,715) and a smaller verifier runtime
bytecode footprint (5,313 versus 11,974 bytes). See
[Phase 2C EVM Verifier Evidence](./phase-2c-evm-verifier-evidence.md).

## Interpretation and limits

This is strong, reproducible engineering evidence for the selected initial
stack. It does not prove superiority for every circuit, machine, cloud
configuration, proof mode, or future release. It does not measure recursion,
batch aggregation, concurrent proof queues, production availability, audit
coverage, or a mainnet gas market.

The results also do not expand what ZK-001 proves: it proves the versioned
deterministic policy-evaluation statement over committed private values; it
does not prove general AI correctness, truthful model-provider claims, or the
quality of a model output.

## Evidence files

- [Machine-readable repeated summary](../benchmarks/zk/runs/2026-08-29-zk001-repeated-summary.json)
- [Reproducible benchmark harness](../scripts/run-zk-proof-benchmark.sh)
- [Single-run native proof evidence](./phase-2c-native-proof-evidence.md)
- [EVM verifier evidence](./phase-2c-evm-verifier-evidence.md)
- [ADR-0006: RISC Zero initial proof-stack selection](./decisions/0006-risc-zero-initial-proof-stack-selection.md)
