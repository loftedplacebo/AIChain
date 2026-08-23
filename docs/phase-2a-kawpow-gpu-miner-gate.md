# Phase 2A KawPoW GPU and Miner Gate

| Field | Value |
|---|---|
| Status | G1 NVIDIA control complete; AMD repeat and G2 node integration pending |
| Version | 0.5 |
| Last updated | 2026-08-23 |
| Governing decision | [ADR-0004](./decisions/0004-kawpow-phase-2a-development-selection.md) |

## Purpose

Separate algorithm/hardware measurement from node interoperability so rented
GPU time starts only when a reproducible workload is ready. No credential,
private key, keystore, or provider token belongs in the repository.

## Stage G1 — Isolated GPU Measurement

Use a pinned, externally licensed KawPoW miner as a measurement tool only. Do
not copy or link its GPL source into Core-Geth.

Minimum first host:

- Ubuntu LTS x86-64;
- one NVIDIA GPU with at least 8 GiB VRAM and supported CUDA driver;
- 4 CPU cores, 16 GiB system RAM, and 50 GiB temporary storage;
- SSH access restricted to the operator's current IP;
- no wallet or production credentials; and
- hourly rental with automatic shutdown after the bounded run.

Record the existing benchmark manifest fields plus:

- exact GPU model, driver, runtime, VRAM, power limit, clocks, and thermal state;
- miner repository, immutable commit, licence, compiler, build flags, and
  binary checksum;
- warm-up duration, sample duration, accepted/rejected work, hashrate, wall
  power, temperature, fan state, and any throttling; and
- raw stdout/stderr and hardware telemetry as untrusted run artefacts.

Repeat later on one AMD/OpenCL-capable GPU. NVIDIA-only results cannot close
the cross-vendor gate.

The committed G1 harness is
[`scripts/run-kawpow-gpu-control.sh`](../scripts/run-kawpow-gpu-control.sh).
It invokes the pinned miner's offline `--benchmark` simulation with CUDA, so it
does not accept or require a pool URL, wallet, or worker credential. It records
the binary checksum, bounded runtime, stdout/stderr, and one-second
`nvidia-smi` telemetry. Raw output must be written outside the repository.

The companion
[`scripts/build-kawpow-gpu-control.sh`](../scripts/build-kawpow-gpu-control.sh)
refuses any source revision other than the pinned commit, checks recursive
submodule state, and builds exactly one CUDA or OpenCL backend. It installs no
system packages and performs no clone itself.

Example pinned checkout and CUDA build:

```bash
git clone https://github.com/RavenCommunity/kawpowminer.git /opt/kawpowminer
git -C /opt/kawpowminer checkout 632f6ea0a5cd09e2c6443374dbe6db0a767715ba
git -C /opt/kawpowminer submodule update --init --recursive
git -C /opt/kawpowminer apply \
  /opt/aichain/patches/kawpowminer/0001-gcc13-cstdint.patch
AICHAIN_KAWPOW_COMPUTE=86 \
AICHAIN_KAWPOW_CXX_FLAGS=-DPTHREAD_STACK_MIN=16384 \
  bash ./scripts/build-kawpow-gpu-control.sh \
  /opt/kawpowminer /opt/kawpowminer/build-aichain-g1 cuda
```

The compatibility patch adds one missing standard-library include required by
GCC 13. The compile definition accommodates glibc 2.39, while `COMPUTE=86`
limits CUDA output to the tested RTX 3060 architecture and avoids architectures
removed from CUDA 12. These are build-compatibility settings; they do not alter
KawPoW behavior.

Example after building the pinned miner on the rented host:

```bash
bash ./scripts/run-kawpow-gpu-control.sh \
  /opt/kawpowminer/build-aichain-g1/kawpowminer/kawpowminer \
  /tmp/aichain-kawpow-g1 \
  42 \
  300
```

The inspected miner revision is
`RavenCommunity/kawpowminer@632f6ea0a5cd09e2c6443374dbe6db0a767715ba`.
Its GPL-3.0 source remains an external measurement tool and must not become a
Core-Geth dependency.

The first NVIDIA control result is recorded in
[KawPoW G1 RTX 3060 Result](../benchmarks/pow/kawpow-g1-rtx3060-2026-08-23.md).
It establishes a reproducible NVIDIA baseline only; it does not close G1 until
the AMD/OpenCL repeat is complete.

## Stage G2 — Node Interoperability

The disabled engine has no mining implementation and `Seal` fails closed. The
development-only wire contract is now specified in
[KawPoW Development Work Protocol](phase-2a-kawpow-development-work-protocol.md).
Implementation must preserve its requirements for:

1. work identifier and version;
2. 32-byte pre-seal commitment, 64-bit nonce, mix/proof, height, and target;
3. byte order for every wire field;
4. stale-work, duplicate, malformed, wrong-height, and wrong-target handling;
5. authentication, rate limits, localhost/default binding, and maximum request
   sizes; and
6. explicit separation from standard Ethereum JSON-RPC methods.

Only then may a miner receive work, submit a candidate seal, and have a local
development node validate it. The initial endpoint must remain disabled by
default and bound to localhost unless an SSH tunnel is used.

## Stage G3 — Network Measurement

After G2 passes locally:

- run a disposable one-node KawPoW development chain;
- add a second validator node that never needs a GPU;
- measure block construction, validation, propagation, stale rate, restart,
  synchronization, and reorganisation behavior;
- replay fixed AVR batch workloads and report logical-receipt throughput
  separately from block-production rate; and
- destroy the disposable chain state after results and non-sensitive manifests
  are captured.

The existing shared Ethash devnet must not be repointed for G1 or G2.

## Rental Trigger

The project should rent the first NVIDIA host only after the G1 harness and
immutable miner pin are committed. Expected first useful rental: a short
one-to-two-hour measurement session. A separate AMD rental follows after the
NVIDIA procedure is reproducible.

## Exit Criteria

- G1 results are reproducible and include power/thermal context, not headline
  hashrate alone.
- NVIDIA and AMD paths both produce results against the same algorithm
  revision and workload.
- G2 accepts valid submitted work and rejects every negative wire vector.
- A CPU-only validator independently accepts GPU-produced blocks.
- No private data or rented-host credential is committed.
- Results do not claim permanent ASIC resistance or quantum resistance.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-23 | Defined the isolated GPU, node-interoperability, and network gates |
| 0.2 | 2026-08-23 | Linked the committed development work-protocol specification |
| 0.3 | 2026-08-23 | Recorded the bounded work registry and retained the no-RPC boundary |
| 0.4 | 2026-08-23 | Recorded strict wire and in-memory service tests; node exposure remains disabled |
| 0.5 | 2026-08-23 | Recorded the completed RTX 3060 control and reproducible modern-toolchain compatibility settings |
