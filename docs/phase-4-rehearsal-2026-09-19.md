# Phase 4 single-GPU rehearsal — 19 September 2026

Status: interim evidence; **not closed-testnet acceptance**.

## Scope and identity

One RTX 3060 miner, a VPS CPU validator, and a laptop CPU validator on an isolated
KawPoW development chain (chain ID 2026082710, ASERT target 10 seconds).
The existing Ethash devnet is unchanged. RPC remains loopback-only and P2P uses
private SSH relays. No production funds or keys are involved.

Genesis block: `0x6214e0a95e9d8bf2f7d9aad65d2cb5b219121a834d4cb9e5409aabd3bb54493d`.
Reviewed node source: `683211f96306323139244f27b3457fa5b49b2eb7`.

At the initial checkpoint the binaries were **not byte-identical**. Miner SHA-256:
`951dbdecd0c1f5b50c8e345e4c6ee3dabb1d5b26fd0a25cc74dd158921b2af8a`;
VPS/laptop SHA-256:
`d2071e4de187e81e91333bdb54a59aed7ff8b268ad014761f0df0e5f5e4da2ad`.
The miner was subsequently restarted on the exact VPS/laptop binary. Its running
`/proc/<pid>/exe` hash was independently verified against the VPS/laptop digest.
The old artifact remains available for rollback. A fresh three-role health
evaluation is required after intentional validator downtime finishes.

## Functional traffic results

- Three synthetic individual anchors succeeded (blocks 4675–4677).
- Batches of 10 and 100 synthetic receipt IDs succeeded (4678–4679).
- Valid Merkle membership passed; a wrong leaf failed for both batch sizes.
- An existing real RISC Zero proof was replayed successfully at block 4724:
  `0x21715e5dc448a41e8f9b139840cf2632a7de082ac88b01d9c6d4818d3374a5e3`.
  The verification transaction consumed 276139 gas.
- Tampered seal and journal calls reverted.

The proof replay is separate from the synthetic anchors: it does not prove those
receipts, provider identity, or model execution. This bounded smoke test is not a
sustained-capacity/TPS measurement. One-block inclusion is not finality.

## Deployment issue and resolution

The retained upstream verifier artifact targeted Cancun and failed gas estimation
on this chain. Rebuilding the same source with `forge build --evm-version paris
--out out-phase4-paris` produced a deployable verifier without changing consensus
rules. The receipt contracts retain their existing Istanbul target. Pin the EVM
target and hash of every deployment artifact; do not reuse an artifact solely
because its contract name matches. The failed estimation sent no transaction;
the retry skipped the seven already confirmed deployment/anchor transactions.

## Resource soak

Miner: 717 samples spanning 7193.43 seconds, maximum node RSS 133799936 bytes,
mean node CPU 1.15% of one core. VPS validator: 720 samples spanning 7193.65
seconds, maximum RSS 121638912 bytes, mean CPU 1.02% of one core.
These are node-process observations, not total host/GPU resource requirements.
They cover approximately two hours; they do not establish 24-hour stability,
sustained AVR load, or continuous alert coverage. The laptop joined later.

## Recovery and remaining gates

The laptop initially synchronized, then independently imported new blocks. All
three nodes agreed at block 4615. A short restart recovered five blocks. Initial
snap synchronization is not evidence of full historical execution.

Long laptop recovery passed: stopped at 4644, restart target 4745 (101-block
gap), reached 4747 in 16 seconds including startup and peering. Logs show 100
blocks imported in the first two segments, including all ten test transactions;
subsequent segments caught up to the advancing head. All three nodes agreed at
4744 on `0xca4a55d55cbaabd891ba45726109290065c3a1fb4029e1d4c5da4f0e46aec361`.
This measures node recovery, not indexer recovery or probabilistic finality.

The project alert evaluator reported `critical: genesis-or-build-mismatch` for
the miner/VPS snapshots. Genesis matches; the real binary hashes differ as
recorded above. This was a build-identity failure, not a consensus split. The
binary correction does not retroactively change the historical alert.

Still required: live node-outage indexer/queue recovery and lag measurements,
sustained capacity, continuous alert coverage, and the wider
multi-miner/AMD/competition/reorg/24-hour gates specified by the Phase 4 policy.
Do not infer those results from this rehearsal.

Raw operational evidence stays under ignored `devnet/phase4-laptop-20260919`.
Never publish encrypted wallets, passwords, relay private keys or raw SSH config.

## Follow-up: standardized binary and indexer recovery

The live, read-only `scripts/test-phase4-indexer-recovery.cjs` test passed on the
mining node. It intentionally uses this specific synthetic rehearsal fixture.
Separate OS processes indexed blocks 4673–4677, then resumed the durable cursor
through 4811: 134 additional blocks in 4721 ms. The recovered index contains three
individual anchors and two batches; both batch inclusion lookups work. Repeating
at the same target indexed zero blocks (82 ms). An injected RPC error preserved
the state file exactly. This is not a live reorg, actual network-outage recovery,
proof-event indexing, or sustained-throughput result.

Example (only this rehearsal, using a fresh output directory):

```bash
AICHAIN_ENABLE_AVR_INDEXER=1 node scripts/test-phase4-indexer-recovery.cjs \
  http://127.0.0.1:8954 /private/traffic /private/new-indexer-evidence \
  0x6214e0a95e9d8bf2f7d9aad65d2cb5b219121a834d4cb9e5409aabd3bb54493d
```

The rolling restart exposed an operational bug: shell `errexit` terminated the
GPU supervisor when IPC polling failed during restart. Polling now tolerates
failure with a one-second backoff; failed peer-count queries also no longer
terminate it. A CPU-only regression injects a transient IPC error and verifies
polling resumes and observes a new height. After deploying the fix, live mining
resumed and advanced through 4815. Historical miner-process abort messages also
exist; this change is not a claim that every miner failure is fixed.

Validation: five indexer unit tests, one supervisor regression, JavaScript syntax,
shell syntax, and the live indexer recovery integration passed.

## Follow-up: VPS recovery and standardized health

The VPS validator recovery passed. It was stopped at 4811, held offline while
the miner advanced by 100 blocks, then restarted against the same datadir. The
restart target was 4911; the validator reached it in 22.32 seconds of catch-up
and 33.78 seconds from restart request to recovery. The recovered target hash
was `0x63df66173cc185f929e63084daa3646ff97d4ad7a0612ea5105b1ee65835860c`,
matching the miner's canonical chain. The laptop reconnected through the VPS
relay and all three nodes later agreed at block 5183.

Fresh post-recovery snapshots from miner, VPS validator and laptop validator all
reported the standardized binary SHA-256
`d2071e4de187e81e91333bdb54a59aed7ff8b268ad014761f0df0e5f5e4da2ad`.
The checked-in alert evaluator returned `normal` with zero alerts. This clears
the earlier temporary build-identity mismatch for the current run; it does not
turn this single-GPU rehearsal into a complete Phase 4 acceptance result.

No rented instance was stopped or deleted.
