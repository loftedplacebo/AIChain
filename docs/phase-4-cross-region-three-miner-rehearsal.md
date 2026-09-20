# Phase 4 — Cross-region three-miner rehearsal

Version: 0.1.0-draft · Run date: 2026-09-20 · Status: completed bounded rehearsal

## Purpose and boundary

This record preserves the public-safe aggregate evidence from a disposable
KawPoW/ASERT interoperability rehearsal. It establishes that three NVIDIA/CUDA
miners can be deployed from the pinned installer, privately connected to a
separate CPU-only validator, and have their blocks independently accepted.

It does **not** establish a public or closed-testnet launch, production block
timing, capacity, finality, mining rewards, ASIC resistance, or mainnet
consensus selection. The rented GPU instances were scheduled for shutdown after
evidence capture; this document does not assert that a provider cancellation or
volume deletion has completed.

## Topology and controls

| Role | Count | Evidence-relevant properties |
|---|---:|---|
| NVIDIA/CUDA mining hosts | 3 | Two RTX 3060s and one RTX 4060 Ti on separate disposable GPU instances |
| CPU-only validator | 1 | Separate VPS; no GPU miner or mining software |
| Connectivity | 3 private relays | Per-miner SSH identities restricted to one VPS loopback forwarding port |
| RPC and P2P exposure | None public | Node RPC, adapter listeners, and test P2P listeners were bound to loopback only |

The validator initiated the three peer connections through encrypted reverse
forwards. No public JSON-RPC, P2P, or telemetry listener was introduced. Each
temporary relay credential was restricted with `restrict`, explicit
`port-forwarding`, and a single `permitlisten=127.0.0.1:port` rule.

## Reproducibility identity

| Item | Value |
|---|---|
| Core-Geth source revision | `49aef031972d069a378a1d6a1720fbdc68b925f1` |
| Chain | Fresh disposable KawPoW/ASERT development chain |
| ASERT target | 10 seconds; 1,800-second development half-life |
| Initial difficulty | `327680` (`0x50000`), intentionally disposable and not a launch recommendation |
| Genesis SHA-256 | `8ccc7c39f3d67d1a7f1b634cdf29374c30121f83ec638250d0c444ca1ef4897f` |
| GPU control-miner SHA-256 | RTX 3060 A: `dc6438c06c107e8db4f541a5b3910c09294d4c3f2ea0c7983e925ced8ff98f6d`; RTX 3060 B: `5292d574fa5c067b4cedd971fcbf1e96e2fa51d0a391f8d4a2f4c75ca4604922`; RTX 4060 Ti: `4b53f00b31efb9b145549c620a47015e254184ad13a1a49d1140cc4a155b02aa` |

The initial bootstrap exposed a Core-Geth interface difference: P2P bind host
is configured through `[Node.P2P].ListenAddr` in TOML, not a `--listenaddr`
CLI flag. [`start-kawpow-asert-node.sh`](../scripts/start-kawpow-asert-node.sh)
now writes that loopback-only configuration explicitly.

## Installer and interoperability result

The pinned one-click GPU bootstrap completed on both newly provisioned hosts.
The pre-existing third GPU host initially contained an upstream miner checkout;
the bootstrap correctly refused to treat it as the pinned AIChain miner and was
rerun in a fresh directory. The VPS validator image initially lacked Go; an
isolated Core-Geth build directory was used after installing Go, without
altering existing validators.

All three mining nodes obtained work through local adapters. The CPU-only
validator maintained three peers, imported mined segments independently, and
observed competing chains/reorganisations. During the measured window, all
roles stayed online and the validator's peer count remained three.

## Ten-minute aggregate measurement

| Measurement | Start | End | Result |
|---|---:|---:|---:|
| Window | 2026-09-20 11:00:52 UTC | 2026-09-20 11:10:52 UTC | 600 seconds |
| Canonical validator height | 173 | 270 | 97-block increase |
| Validator peer count | 3 | 3 | stable |
| Validator-observed reorg count | 10 | 10 | no new reorg in measured window |
| Mean canonical block interval | — | — | approximately 6.2 seconds (`600 / 97`) |

The ten earlier natural reorgs occurred during the low-difficulty startup and
show that the validator processed competing GPU work. A raw imported-segment
count is not a candidate-block count and must not be used to infer stale rate.
Restricted raw logs and per-miner adapter evidence remain outside this
repository; no endpoint, key, account, IP address, or raw evidence was added
here.

## Interpretation

The rehearsal closes the narrow deployment/interoperability question:

- fresh installers worked on three NVIDIA/CUDA hosts;
- the private relay topology supported a three-miner/one-validator overlay;
- each hardware class participated in a live KawPoW chain; and
- a non-mining Core-Geth validator independently accepted the chain.

It does not validate the configured 10-second target. The average observed
interval was faster because this fresh chain began at a deliberately low
difficulty and ASERT was still adapting. A representative multi-miner hash-rate
calibration must set any future initial difficulty; the development baseline
remains **TBD**, not a release parameter.

## Remaining Phase 4 gates

- Two independent non-mining validators across the required regional/operator
  split, including sync, restart, partition and recovery exercises.
- Controlled competing-branch, malformed-block/submission and reorganisation
  exercises with reviewed results.
- Sustained capacity, AVR/proof/indexer traffic, resource, queue and recovery
  measurements against approved thresholds.
- Independent-operator governance, monitoring, release record, genesis review,
  reset/upgrade rehearsal and security review.
- AMD/OpenCL compatibility remains explicitly deferred to post-mainnet work.

See [Phase 4 closed-testnet foundation](phase-4-closed-testnet-foundation.md)
and [Phase 4 measurement and fault-test harness](phase-4-measurement-and-fault-harness.md).
