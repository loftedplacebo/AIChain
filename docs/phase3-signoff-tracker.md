# Phase 3 sign-off tracker

Updated: 2026-09-08. **Overall status: incomplete.** Commit/push requested only
after the outstanding gates pass; do not represent pending gates as completed.

| Gate | Status | Evidence / next action |
|---|---|---|
| Sustained mixed workload | Passed, bounded profile | 300 s; 32,080 logical receipts, 320 batches, 80 individual anchors, 80 real-proof replays; 106.9 logical receipts/s; fresh index rebuild 16.75 s |
| Multi-peer KawPoW integrated rerun | Passed, disposable network | RTX 3060 mining node and CPU-only VPS validator peered through authenticated SSH relays; 65+ accepted GPU solutions were recorded. A 12-block observer sample had matching canonical hashes at every height. |
| Governance boundary tests with a real proof | Passed | Anvil simulated time; 306,420 gas for `verifyAndRecord`; not a real elapsed-time result |
| Real governance activation delay | Pending | Earliest wall-clock completion: 2026-09-09 05:53:57.989 UTC, plus chain activation condition |
| KawPoW validator restart and catch-up | Passed, disposable network | Validator stopped cleanly at height 95, GPU miner advanced to 104, then validator restarted, re-peered and caught up to height 114. |
| Phase 3 development-runner restart | Passed, replacement profile | Fresh custom-genesis CPU-Ethash runner kept its genesis across a clean restart and sealed a post-restart transaction. This runner is development-only, not an AIChain consensus selection. |
| Replacement-profile complete proof workload | Passed, bounded profile | Fresh real RISC Zero proof (230,130 ms), pinned on-chain adapter verification (267,227 gas), 1,000-receipt load/replay, JavaScript/Python presentation checks and clean restart/recovery all passed. It is cold CPU-Ethash development evidence, not a comparable TPS or KawPoW result. |
| Historical `--dev` restart profile | Documented legacy limitation | Existing Core-Geth `--dev` database rejected on restart. It is no longer the Phase 3 runner. The live governance-delay trial remains on that isolated legacy profile and must not be restarted before it finishes. |

## Real delay trial

On the VPS, an isolated loopback-only Core-Geth node remains running for this
trial. The existing operational devnet is unchanged. It uses synthetic accounts
and no user funds. Its directory is:

`/tmp/aichain-phase3-hSThJP/repro/devnet/phase3-signoff`

Registry: `0x7D9EC0a9EbBd104706c75330d13e2e790fbC3CeB`

Version: `0x486512b4e3448cec7fdb3192b9a323bc709d82e81b2ff00a888b7fd847c59cb8`

`governance-pending.json` contains a disposable guardian private key. It remains
outside Git and must not be printed, copied into documentation or published.
`governance-scheduled-public.json` is the non-secret scheduling record.

After the real wall interval, run from the isolated source checkout:

```bash
PATH=/tmp/aichain-phase3-hSThJP/node-v24.8.0-linux-x64/bin:$PATH \
AICHAIN_ENABLE_PHASE3=1 timeout 120 node scripts/phase3-governance.js \
  finish devnet/phase3-signoff
```

The finish command checks genesis identity, wall time and contract activation;
then verifies the actual proof, caps, role controls, pause, duplicate rejection,
irreversible retirement and retained historical record. It does not time-warp
the live trial. Keep it separate from the `simulated` mode on Anvil port 18558.

Do not stop/restart this trial node casually: it uses the historical `--dev`
profile with a known restart limitation. If continuity is lost, investigate and
restart the trial honestly; never change its delay or rewrite the evidence to pass.

## KawPoW multi-peer evidence

The fresh Phase 3 rerun used a disposable custom-genesis KawPoW network only;
it did not alter the VPS development chain or expose public JSON-RPC.

- GPU mining node: one RTX 3060 on a separate host.
- Validator: a distinct VPS process with no GPU mining software.
- Connectivity: two authenticated SSH relays with loopback-only node RPC and
  loopback-restricted P2P admission; discovery was disabled.
- Mining audit: at least 65 accepted candidate submissions were independently
  verified and imported by the mining node. Duplicate submissions after an
  accepted work item were rejected as duplicates.
- Observer sample: heights 71–82 had identical canonical hashes on both nodes.
  Production mean was 4,045 ms in this deliberately low-difficulty profile.
  The 25 ms observer polling interval makes its propagation figures a sampling
  bound, not a claim of sub-25 ms network propagation.
- Recovery: the validator stopped at height 95. While offline the miner reached
  104. After restart and explicit peer reconnection, the validator caught up to
  height 114 with one peer.

This proves node-to-GPU-miner-to-independent-validator interoperability. It is
not a public testnet, an ASIC-resistance result, or a production capacity claim.

## Historical restart limitation and replacement

Restarting the earlier isolated dev directory failed with:
`Bad developer-mode genesis configuration: genesis block difficulty must be > terminalTotalDifficulty`.

The local baseline checks this condition in `node/core-geth/cmd/utils/flags.go`.
No consensus validation was bypassed and the database was not reset. The Phase 3
runner now creates a fresh custom-genesis CPU-Ethash development chain rather
than using `--dev`. Its isolated VPS restart test passed with genesis
`0x24d05d8933528e9ef98c749406caad7ade04c34dbff34b970c4176391a3141cb`:
block 0 survived restart and a post-restart transaction advanced the chain from
block 0 to 1. This resolves runner recovery while retaining the `--dev` behavior
as a documented Core-Geth baseline limitation.
