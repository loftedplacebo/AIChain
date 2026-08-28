# Phase 2A ASERT Live Validation

| Field | Value |
|---|---|
| Status | Development validation complete |
| Document version | 0.1 |
| Last updated | 2026-08-28 |
| Scope | Disposable KawPoW chains only |
| Machine-readable evidence | [ASERT live run summary](../benchmarks/pow/runs/2026-08-28-asert-live/run-summary.json) |
| Selected development profile | 10-second target; 1,800-second ASERT half-life |
| Production status | **TBD**; this result does not close L1-001 or L1-003 |

## 1. Outcome

The planned ASERT integration and hardening work passed on three independent machines. A pinned RTX 3060 mined real KawPoW blocks; CPU-only Core-Geth nodes on the Contabo VPS and Windows laptop independently verified, imported, synchronized, restarted, and reorganized those blocks.

The existing Ethash devnet was not modified. Every live trial used a fresh genesis, distinct development network ID, explicit `--aichain.kawpowdev --aichain.kawpowdev.asert-target` activation, loopback-only AI mining RPC, and disposable data directories.

This closes the isolated ASERT engineering milestone. It does not select production economics, launch difficulty, confirmation policy, or final mainnet consensus parameters.

## 2. Implemented Consensus Boundary

- Integer-only, per-block ASERT with a fixed 1,800-second half-life.
- Allowed development targets are exactly 5, 10, and 15 seconds.
- Activation is the genesis child at block 1; genesis is the fixed anchor.
- Difficulty is bounded to valid positive 256-bit values.
- Non-increasing timestamps, missing/invalid anchors, malformed difficulty, and unsupported profiles are rejected.
- The same difficulty callback is used for block preparation, single-header validation, batch validation, synchronization, and competing-branch import.
- KawPoW seal verification remains independent on CPU validators.
- Uncles are disabled for this development profile so the inherited Ethash uncle path cannot bypass ASERT rules.
- Normal Core-Geth/Ethash behavior remains the default when the opt-in flags are absent.

Core-Geth commit `59ba79d84681ef1e70ecbf9b179133496ac71a59` contains the consensus implementation. The matching Linux binary used on the RTX host and VPS had SHA-256 `8b2e02390fe267b321e4128af5d916b6f3c73e67f0826073f8f8b45bd432931d`.

## 3. Automated Validation

The passing suite covers:

- committed independent Python/Go vectors;
- 5/10/15-second profile admission and all other target rejection;
- activation and anchor rules;
- preparation, single-header, and batch-header equivalence;
- timestamp rejection and minimum/maximum difficulty bounds;
- malformed/tampered difficulty rejection;
- reorg-branch calculation equivalence;
- unsupported-uncle rejection;
- real node pending-template integration;
- 155,002 fuzz executions without an out-of-bounds result; and
- CLI package compilation and default-disabled behavior.

The standard upstream Ethash cache/DAG stress test was not used as an ASERT gate because it exceeded the bounded local test window while generating its large cache. Focused stock difficulty tests passed, and the KawPoW/ASERT and node integration suites passed.

## 4. Live Three-Machine Results

| Target | Sample | Initial/mean difficulty | Mean interval | Median | p95 | Result |
|---|---:|---:|---:|---:|---:|---|
| 5 s | 20 blocks | 63,554,165 initial | 7.26 s | 6 s | 14 s | Accepted by all three nodes |
| 10 s | 100 blocks | 127,108,329 mean | 10.57 s | 8 s | 21 s | Accepted by all three nodes |
| 15 s | 20 blocks | 190,662,495 initial | 12.74 s | 11 s | 34 s | Accepted by all three nodes |

These are short development samples from one RTX 3060 and are not production block-time guarantees. The 5- and 15-second samples are especially sensitive to hash-rate variance and the 30-minute half-life. The result supports keeping 10 seconds as the development default because it was also exercised in the long run, reorg, catch-up, and AVR tests.

### Calibration finding

Pre-calibration 5- and 15-second runs both averaged about four seconds. Their inherited G3-style genesis difficulties were too low, so the node's work-template/recommit cadence dominated before the deliberately slow ASERT rule could converge. The overnight 10-second chain established an observed steady difficulty around 127 million. Repeating 5 and 15 seconds with proportional starting difficulties produced differentiated timing. Launch difficulty must therefore be derived from representative multi-miner hash-rate measurements and remains **TBD**.

## 5. Failure, Recovery, and Reorganisation

- The mining node continued overnight to block 5,297 while both validators were disconnected at block 1,712.
- Both validators imported the 3,585-block gap and converged in 20.324 seconds.
- Both validators then passed clean process restarts and returned to the same canonical height.
- A controlled fork cloned shared state at block 5,313.
- Validators first accepted branch A. At height 5,314 its canonical hash was `0x3f23b4cadf52e05502bc4407251cd3b0348eca60b08ebf6c4d42e212b3d398f2`.
- A separately GPU-mined branch B exceeded A's total work. At height 5,314 its hash was `0xfa945ced3a99260c5841651266520b55ec4f93a834169dcca78fd1359633c681`.
- The laptop and VPS replaced branch A with branch B in 10.821 seconds.
- Malformed, invalid-seal, stale, and duplicate work submissions were each rejected with their expected status.

This demonstrates the intended greater-total-work fork choice and exercises ASERT difficulty validation during real synchronization and reorganisation.

## 6. AVR Traffic on the 10-Second Chain

| Workload | L1 transactions | Logical receipts | Confirmed transaction TPS | Confirmed logical receipt TPS |
|---|---:|---:|---:|---:|
| Individual anchors | 20 | 20 | 1.04 | 1.04 |
| Batches of 10 | 10 | 100 | 0.99 | 9.93 |
| Batches of 100 | 10 | 1,000 | 0.81 | 80.51 |

These measurements cover application broadcast and confirmation on the disposable three-node chain. Logical receipt throughput is not raw blockchain TPS. The results reinforce batching/rollup work as the scaling path for high-volume AI receipts.

## 7. What Is Settled and What Remains Open

Settled for continued development:

- KawPoW plus integer ASERT is technically viable in the Core-Geth fork.
- Ten seconds and a 30-minute half-life remain the preferred development profile.
- GPU mining and CPU-only independent validation interoperate.
- Receipt batching is necessary for the intended submission volume.

Still **TBD** before production:

- final PoW selection and quantum-threat assessment;
- launch/minimum difficulty and hash-rate bootstrap policy;
- final target interval and confirmation policy;
- multi-miner geographic trials, stale/orphan targets, and attack simulations;
- AMD/OpenCL interoperability repeat;
- mining rewards, issuance, fee market, and native-coin economics; and
- ZK statement/stack selection and production receipt rollup design.

## 8. Reproduction Artifacts

- `scripts/prepare-kawpow-asert-run.sh` creates fresh target-specific genesis/state and supports an explicit measured `ASERT_INITIAL_DIFFICULTY` override.
- `scripts/start-kawpow-asert-node.sh` requires explicit ASERT development activation.
- `scripts/capture-kawpow-asert-trial.py` records block timing and submission evidence.
- Raw summaries and AVR reports are under `benchmarks/pow/runs/2026-08-28-asert-live/`.

## 9. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-28 | Recorded consensus implementation, three-machine timing trials, recovery, reorg, rejection, soak, and AVR results |
