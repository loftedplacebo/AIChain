# G2 Node-to-GPU KawPoW Interoperability

| Field | Value |
|---|---|
| Status | **Completed — pass** |
| Document version | 0.2 |
| Last updated | 2026-08-24 |
| Scope | Phase 2A, G2 only |

## Objective

Prove that an explicitly enabled AIChain Core-Geth node can issue a real pending-block template to the pinned KawPoW GPU miner, independently verify the returned seal on CPU, and import the complete block through normal chain validation.

This test uses a disposable chain. It does not alter or migrate the existing Ethash development network.

## Safety Boundary

- `--aichain.kawpowdev` is required; default Core-Geth behavior is unchanged.
- The `aichain` development RPC is registered only when the flag is enabled.
- The node rejects access unless the transport is IPC or HTTP/WebSocket loopback.
- The adapter also binds to loopback and connects only to a loopback node RPC.
- Work storage, clients, request size, issue rate, submission rate, and concurrent CPU verification are bounded.
- The disposable genesis parameters are test inputs, not network or economic decisions.

## Flow

```text
Core-Geth pending block
        |
        v
aichain_getKawpowWork (localhost only)
        |
        v
thin getwork adapter --> pinned RTX 3060 KawPoW miner
        |                         |
        +<--- nonce + mix digest--+
        |
        v
aichain_submitKawpowWork
        |
        v
CPU KawPoW verification --> normal InsertChain --> canonical block
```

The node owns every block field except the nonce and mix digest. The adapter translates the established miner's `eth_getWork`/`eth_submitWork` shape; it does not decide consensus fields.

## Components

- Node flag: `--aichain.kawpowdev`
- Node methods: `aichain_getKawpowWork`, `aichain_submitKawpowWork`
- Adapter: `scripts/kawpow_getwork_adapter.py`
- Disposable genesis: `config/kawpow-g2-disposable-genesis.json`
- Linux build: `scripts/build-core-geth-linux.sh`
- Node launcher: `scripts/start-kawpow-g2-disposable-node.sh`
- Rejection check: `scripts/verify-kawpow-g2-rejections.py`

## Acceptance Evidence

The G2 run must record:

1. Core-Geth and miner source revisions and binary hashes.
2. The node-issued work ID, header hash, seed hash, target, height and expiry.
3. The GPU-found nonce and mix digest.
4. CPU verification acceptance and imported canonical block hash/height.
5. Rejection of malformed, invalid-seal, stale/unknown and duplicate submissions.
6. Confirmation that both node and adapter listened on loopback only.

## Result

G2 passed on 2026-08-24. The pinned RTX 3060 miner solved node-issued block 1. The node independently verified the nonce and mix digest through the CPU KawPoW verifier, then imported the complete block through normal `InsertChain` validation.

| Field | Result |
|---|---|
| Work ID | `0x5ca28ad10f841454067bf2c0a8a25c3bd9c001659ce745c2c12af2ca1b6f9c4a` |
| Pre-seal header | `0x66b7b254d9875f994bef18fcdb0169e7f2cd75511e63c37df49e7f9dbe4e9470` |
| GPU nonce | `0x395ef76334be2f92` |
| GPU mix digest | `0xf6f5bd6bbe7f81408a79329be7881b92683ef4bb5164f07b2490edfa242cae76` |
| Imported block | `1` |
| Canonical block hash | `0x8603c37f551dde31d2cb4d834a872e7cd162d5fde157307a99d4902102700299` |
| Normal import latency | `16.360 ms` on the disposable host |
| Negative submissions | malformed, invalid seal, stale/unknown, and duplicate all rejected |

The node RPC listened on `127.0.0.1:8545`; the adapter listened on `127.0.0.1:18545`. The existing Ethash devnet was not changed. The machine-readable result is [2026-08-24 G2 RTX 3060 Node Interop](../benchmarks/pow/runs/2026-08-24-g2-rtx3060-node-interop.json).

The live run first exposed and then regression-tested a template-boundary defect: Core-Geth's public pending snapshot was not the fully finalized sealing task. The integration now caches the immutable block passed into `Seal`, and work acceptance is transactional so an import failure releases the reservation for a safe retry.

## Open Decisions

- Production retarget and difficulty parameters remain **TBD**.
- Production RPC/API shape and version remain **TBD**.
- Miner adapter packaging and support policy remain **TBD**.
- A separate-host CPU verifier is a later hardening step; G2 requires an independent CPU verification path, not separate hardware.

## Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-24 | Added the bounded G2 implementation and execution contract. |
| 0.2 | 2026-08-24 | Recorded the passing RTX 3060 block-1 mine, CPU verification, canonical import, rejection matrix, and retained evidence hashes. |
