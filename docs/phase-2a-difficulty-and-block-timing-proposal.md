# Phase 2A Difficulty and Block-Timing Proposal

| Field | Value |
|---|---|
| Status | **Simulation completed — conditional development selection recorded** |
| Document version | 0.2 |
| Last updated | 2026-08-25 |
| Decisions affected | L1-001 mining algorithm; L1-003 network and genesis parameters |
| Depends on | [G3 Two-Node KawPoW Network Validation](./phase-2a-g3-network-validation.md) |

## 1. Recommendation

Advance the following combination into an isolated Phase 2A simulation and
implementation spike:

- **Target block interval:** 10 seconds.
- **Difficulty family:** integer-only, per-block ASERT.
- **Development integration half-life:** 1,800 seconds (30 minutes).
- **Completed comparison sweep:** 1,800, 3,600, and 7,200 seconds.
- **Header format:** retain the existing EVM-compatible `difficulty`,
  `timestamp`, `nonce`, and `mixHash` fields.
- **Fork choice:** retain greatest valid accumulated work.
- **Timestamp baseline:** retain Core-Geth's strictly increasing timestamp and
  15-second future-block limit for the first spike.
- **Emergency reset:** none on a production-profile chain.
- **Throughput strategy:** scale AVR volume through batching, aggregation, and
  later rollup evaluation—not by forcing sub-second PoW blocks.

These are candidate values for testing. They do not close **L1-001** or
**L1-003**, select mainnet parameters, or authorize production activation.

The simulation has now completed. Its evidence advances a 10-second target and
a 1,800-second ASERT half-life to the isolated integration spike. See
[Difficulty Simulation Results](./phase-2a-difficulty-simulation-results.md).
The production values remain **TBD**.

## 2. Why Ten Seconds

The G3 network produced supervised development blocks approximately every four
seconds, but that result used two controlled hosts, a private SSH relay, low
traffic, and a test supervisor around the external miner. It is not sufficient
evidence for a four-second production target.

A 10-second candidate:

- remains materially faster than the inherited Ethereum PoW-era timing;
- provides more propagation and CPU-verification margin than the G3 setting;
- gives human-scale confirmation tiers of roughly seconds to minutes;
- limits avoidable stale-block pressure while the network is young; and
- keeps AI receipt capacity independent from consensus timing because batches
  already demonstrated much higher logical throughput than transaction TPS.

The production target remains **TBD** until multi-region measurements compare
at least 5, 10, and 15 seconds under the same workloads.

## 3. Why the Current Ethash Rule Is Only the Control

The pinned Core-Geth baseline calculates expected difficulty from the parent
difficulty and timestamp. Its standard constants include a `1/2048` adjustment
step, a minimum difficulty of `131072`, and a 15-second future-block limit.
That is valuable as a low-divergence control, and Core-Geth already validates
the expected difficulty deterministically.

It is not the recommended production candidate for a new GPU network because:

- adjustment is intentionally gradual and can react poorly to large rental or
  launch-period hash-rate changes;
- the inherited minimum difficulty dominated the G3 disposable genesis value;
- its historic parameters were tuned for a different network and mining
  economy; and
- retaining code solely because it already exists would turn temporary
  Ethereum assumptions into AIChain protocol decisions.

Core-Geth's implementation remains the compatibility reference and must stay
unchanged outside the explicitly selected AIChain consensus boundary. See the
[Core-Geth Ethash implementation](https://github.com/etclabscore/core-geth/blob/master/consensus/ethash/consensus.go).

## 4. Candidate Comparison

| Candidate | Advantages | Risks and cost | Proposal disposition |
|---|---|---|---|
| Existing Ethash per-parent rule | Smallest initial code change; existing Core-Geth tests | Slow response to large hash changes; inherited constants; G3 minimum-difficulty mismatch | Keep as control |
| LWMA | Responsive to recent hash changes; designed for volatile smaller PoW networks | Window/history logic; parameter sensitivity; more timestamp and boundary cases | Simulation comparator |
| ASERT | Smooth per-block schedule; integer implementation; no rolling-window discontinuity; designed to reduce oscillation and switch-mining advantage | Requires anchor rules and fixed-point vectors; half-life and timestamp policy must be selected for AIChain | **Lead development candidate** |

Bitcoin Cash's ASERT specification describes its goals as reducing periodic
difficulty/hash-rate oscillation, improving confirmation regularity, and
reducing the advantage of switch mining. It also specifies integer-only
arithmetic and an explicit anchor, avoiding platform-dependent floating-point
consensus results. Its two-day half-life was selected for a 600-second,
established network and is not copied into this proposal. See the
[ASERT specification](https://reference.cash/protocol/forks/2020-11-15-asert).

LWMA remains a useful comparator because it emphasizes recent blocks and can
respond quickly after transient hash attacks, but its author also documents
the stability-versus-response trade-off created by the averaging window. See
the [LWMA reference discussion](https://github.com/zawy12/difficulty-algorithms/issues/3).

## 5. Candidate ASERT Rule

For a block at candidate height `h`, the conceptual target is:

```text
next_target = anchor_target × 2^(
  (actual_elapsed_seconds - target_seconds × height_delta)
  / half_life_seconds
)
```

where:

- `anchor_target` is the target corresponding to the anchor difficulty;
- `actual_elapsed_seconds` is measured from the anchor timing reference;
- `height_delta` is the number of scheduled block intervals since the anchor;
- `target_seconds` starts at the proposed 10 seconds; and
- `half_life_seconds` is 1,800 for the isolated integration candidate.

The implementation must use deterministic integer/fixed-point arithmetic. No
floating-point operation may influence consensus.

### Anchor policy

- A fresh disposable chain anchors at genesis.
- A future upgrade of an existing chain anchors at the last valid pre-upgrade
  block, with activation and anchor selection fixed by chain configuration.
- Reorganisations must recompute from the anchor and candidate branch history;
  no mutable local cache may become consensus state.
- Anchor parameters must be included in genesis/chain configuration and test
  vectors before any public testnet.

### Bounds

- Difficulty must always be positive.
- The derived target must not exceed a configured maximum target or overflow
  256 bits.
- The maximum target/minimum difficulty must be calibrated from measured GPU
  hash rate so a launch chain remains mineable without becoming trivially
  forgeable.
- There is no production testnet-style "long delay means minimum difficulty"
  rule in the candidate; such rules can be gamed and create discontinuities.
- Any optional per-block adjustment clamp must be evaluated in simulation and
  recorded explicitly. No clamp is assumed by this proposal.

## 6. Timestamp Policy

The first spike retains the existing EVM/Core-Geth rules:

1. `header.timestamp` must be strictly greater than the parent timestamp.
2. A node rejects a block more than 15 seconds ahead of its local clock.
3. ASERT uses the candidate block timestamp and the fixed anchor reference.

This preserves current header and contract-time semantics while limiting a
single miner's forward adjustment to a small fraction of the proposed one-hour
half-life. Timestamp attacks still require explicit simulation. Median-time-
past and a different future-time bound remain alternatives, not agreed rules.
Bitcoin's use of median time past demonstrates one established protection, but
adding it to AIChain would be a separate consensus choice rather than inherited
compatibility. See Bitcoin's
[timestamp validation tests](https://github.com/bitcoin/bitcoin/blob/master/test/functional/feature_block.py).

## 7. Confirmation Model

PoW finality is probabilistic. The following are UX hypotheses for testing,
not security guarantees:

| Tier | Candidate wait | Intended use |
|---|---:|---|
| Observed | 1 block, about 10 seconds | Receipt visible; low assurance |
| Standard | 6 blocks, about 1 minute | Ordinary AVR inclusion |
| High assurance | 30 blocks, about 5 minutes | Higher-value organisational checkpoints |
| Bridge/finality-sensitive | **TBD**, expected materially higher | Asset bridge or irreversible external action |

Confirmation labels must be derived from measured reorg probability and
attacker-cost assumptions before release. A bridge must not adopt these
hypotheses as final policy.

## 8. Simulation Matrix

Build a deterministic simulator and run every candidate against identical
random seeds and work traces:

| Scenario | Required variants |
|---|---|
| Stable hash rate | 100,000 or more simulated blocks |
| Step increase | 2×, 10×, and 100× hash rate |
| Step decrease | 50%, 90%, and 99% hash loss |
| Switch mining | Repeated on/off rental cycles |
| Gradual change | Linear and exponential growth/decline |
| Timestamp behavior | Honest, maximum future skew, minimum increments, colluding minority |
| Network split | 50/50, 70/30, and 90/10 partitions followed by reconnection |
| Anchor/reorg | Reorg across ordinary blocks and activation boundary |
| Arithmetic boundaries | Minimum difficulty, maximum target, height/time overflow, negative schedule error |

Compare:

- existing Core-Geth Ethash control;
- LWMA parameter windows appropriate to 5/10/15-second targets; and
- ASERT half-lives of 30, 60, and 120 minutes.

Record mean/median/p95/p99 block interval, longest delay, burst rate, time to
recover after each hash shock, difficulty variance, timestamp advantage,
switch-miner profitability proxy, and reorganisation work.

## 9. Development Acceptance Gates

The candidate may advance from simulation to a disposable network only if:

- independent implementations reproduce every integer test vector;
- difficulty and target remain positive, bounded, and deterministic;
- no tested timestamp sequence can drive difficulty to zero or overflow;
- stable-hash simulations remain close to the target without periodic bursts;
- hash-rate shock recovery is materially safer than the Ethash control;
- fork choice uses verified accumulated work across competing branches;
- activation and anchor reorg tests pass; and
- fuzz, race, malformed-header, batch-sync, and cross-platform tests pass.

The candidate may advance toward public testnet only after:

- NVIDIA and AMD miners produce valid work against the same rules;
- at least three independent hosts complete partition/recovery tests;
- 5/10/15-second network trials quantify stale rate and propagation;
- a multi-day soak includes AVR batch traffic;
- pool and solo-mining paths are specified; and
- an external consensus/security review finds no unresolved critical issue.

## 10. Implementation Sequence

1. Add a standalone, pure Go integer ASERT calculator and fixed test vectors.
2. Add the Ethash control and LWMA/ASERT simulation harness outside consensus.
3. Run the full parameter sweep and publish the raw seeds/results.
4. Select one development parameter set through a recorded decision update.
5. Integrate it only behind `--aichain.kawpowdev` and explicit chain config.
6. Make `Prepare`, single-header verification, batch-header verification, and
   fork import call the same calculator.
7. Add activation/anchor, timestamp, overflow, malformed, and reorg tests.
8. Run a fresh disposable GPU/CPU network; do not migrate the Ethash devnet.
9. Repeat across NVIDIA and AMD, then run the longer multi-host soak.
10. Decide whether evidence is sufficient to close **L1-001** and **L1-003**.

## 11. Explicitly Open Decisions

| Item | Proposal state |
|---|---|
| Production block interval | **TBD**; 10 seconds leads the 5/10/15-second trial |
| Production difficulty algorithm | **TBD**; ASERT selected only for isolated integration |
| ASERT half-life | **TBD** for production; 30 minutes selected for isolated integration after the 30/60/120-minute sweep |
| Maximum target/minimum difficulty | **TBD**, derived from measured launch hash rate |
| Timestamp rule beyond current Core-Geth checks | **TBD** |
| Adjustment clamp | **TBD**; none assumed |
| Confirmation tiers | **TBD**; hypotheses only |
| Uncle/ommer policy and rewards | **TBD**; must not alter DAA implicitly |
| Mining rewards and issuance | **TBD** under L1-004 |
| Production KawPoW activation | **TBD** under L1-001 |

## 12. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-25 | Proposed 10-second ASERT-led simulation, alternatives, safeguards, and acceptance gates |
| 0.2 | 2026-08-25 | Linked the completed simulation and its conditional 10-second/30-minute development selection |
