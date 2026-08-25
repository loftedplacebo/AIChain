# Phase 2A Difficulty Simulation Results

| Field | Value |
|---|---|
| Status | **Completed — conditional development pass** |
| Document version | 0.1 |
| Last updated | 2026-08-25 |
| Scope | Deterministic simulation only; no node consensus activation |
| Proposal | [Difficulty and Block-Timing Proposal](./phase-2a-difficulty-and-block-timing-proposal.md) |
| Machine-readable evidence | [Full simulation report](../benchmarks/pow/runs/2026-08-25-difficulty-simulation.json) |

## 1. Outcome

Advance **10-second blocks with a 1,800-second (30-minute) ASERT half-life** to
an isolated Core-Geth integration spike.

This is a development selection, not a production protocol decision. It does
not close L1-001 or L1-003, activate the rule on the existing Ethash devnet, or
establish the final block interval.

The simulation supports ASERT over the inherited Ethash adjustment because it
held stable timing close to target and recovered materially faster from large
hash-rate changes. The 30-minute half-life recovered faster than the 60- and
120-minute ASERT variants while retaining low stable difficulty variance.

The simulation cannot select 5, 10, or 15 seconds on propagation evidence.
Each ASERT target was stable in the mathematical model. Ten seconds remains
the development-network candidate pending real multi-host latency and stale
block measurements.

## 2. Reproducible Boundary

- Implementation: [difficulty simulator](../spikes/difficulty-simulator/README.md)
- Base seed: 20260825
- Scenario runs: 273
- Partition runs: 63
- Stable blocks per configuration: 100,000
- Total simulated blocks: approximately 5.9 million
- Report SHA-256:
  1eb5896f1405213bceabbf11dce6cf54280881e02c3a146d3ed22e540bd37309
- Two consecutive full regenerations produced the same report SHA-256.
- Go tests: pass
- Go race-enabled tests: pass using the repository-pinned LLVM toolchain
- Independent Python/Go ASERT vectors: six of six match
- Acceptance verifier: pass

The integer difficulty calculators contain no floating-point consensus
arithmetic. Floating point is confined to Monte Carlo timing and report
metrics.

## 3. Stable Hash-Rate Results

Ten-second configurations:

| Candidate | Mean interval | p95 interval | Difficulty CV | Final difficulty ratio |
|---|---:|---:|---:|---:|
| Inherited Ethash control | 12.59 s | 37.73 s | 0.03 | 1.26 |
| LWMA N=30 | 10.09 s | 30.66 s | 0.19 | 0.88 |
| LWMA N=60 | 10.06 s | 30.28 s | 0.13 | 1.01 |
| LWMA N=90 | 10.05 s | 30.18 s | 0.11 | 1.04 |
| ASERT half-life 30 min | **10.00 s** | 30.00 s | 0.04 | 1.03 |
| ASERT half-life 60 min | **10.00 s** | 29.98 s | 0.03 | 1.01 |
| ASERT half-life 120 min | **10.00 s** | 29.96 s | 0.02 | 1.00 |

The Ethash control retains its EIP-100 nine-second adjustment divisor, so it
does not naturally target the proposed ten-second schedule. It remains useful
as the inherited behavior control, not as a retuned candidate.

## 4. Hash-Rate Shock Recovery

Recovery means difficulty remained within ten percent of the new ideal for 12
consecutive blocks.

| Ten-second scenario | ASERT 30 min | Ethash control |
|---|---:|---:|
| Hash rate increases 2x | 55.2 min | 172.1 min |
| Hash rate increases 10x | 113.4 min | 368.7 min |
| Hash rate increases 100x | 98.1 min | 448.0 min |
| Hash rate decreases 50% | 126.2 min | Not reached |
| Hash rate decreases 90% | 189.2 min | Not reached |
| Hash rate decreases 99% | 322.7 min | Not reached |

LWMA often recovered faster than ASERT, but exhibited higher stable difficulty
variance and much worse behavior under the fully colluding minimum-timestamp
scenario. It remains a comparator rather than the integration candidate.

## 5. Timestamp Findings

- The simulator enforces a timestamp strictly greater than the parent and no
  more than 15 seconds ahead of simulated wall time.
- No accepted simulated block exceeded the 15-second future limit.
- Continuous 15-second future skew and a deterministic 30-percent skewing
  minority remained close to the target schedule.
- A fully colluding chain using only one-second timestamp increments can drive
  ASERT and LWMA toward the configured maximum difficulty and deliberately
  stall its own branch.
- Target bounds prevented zero, negative, overflow, or unbounded allocation
  behavior.

The full-collusion result does not imply that a minority can halt the canonical
chain; a majority can already censor or stop PoW production. It does mean the
timestamp policy and time-warp threat model must remain an explicit public
testnet gate.

## 6. Partition and Fork-Work Findings

Every 70/30 and 90/10 one-hour partition selected the higher-hash branch by
verified accumulated work for every tested algorithm and parameter set.
Fifty/fifty outcomes varied with the deterministic work trace, as expected.

These are work-selection simulations. They do not replace the completed G3
peer reorganisation test or the required multi-host propagation campaign.

## 7. Development Decision

The next disposable-chain spike will use:

- target interval: 10 seconds;
- ASERT half-life: 1,800 seconds;
- anchor: genesis for a fresh disposable chain;
- integer 16.16 exponent/polynomial arithmetic;
- simulation bounds only until launch GPU hash rate calibrates production
  maximum target and minimum difficulty;
- greatest verified accumulated work;
- existing strictly-increasing and 15-second-future timestamp checks; and
- the existing opt-in KawPoW development boundary.

These values are not permitted on the existing Ethash devnet and are not
mainnet parameters.

## 8. Remaining Gates

Before a public testnet decision:

1. Integrate the calculator behind explicit disposable-chain configuration.
2. Use the same calculator in header preparation, single verification, batch
   verification, and fork import.
3. Add activation, anchor, timestamp, malformed-header, overflow, fuzz, and
   reorganisation vectors at the Core-Geth boundary.
4. Mine and independently validate blocks on the NVIDIA path.
5. Repeat the miner path on AMD/OpenCL.
6. Compare 5/10/15-second targets across at least three independent hosts.
7. Measure propagation, stale rate, catch-up, partitions, and AVR capacity.
8. Run the longer soak and external consensus review.

## 9. Verification Commands

From the simulator directory:

    go test ./...
    go run . -out ../../benchmarks/pow/runs/2026-08-25-difficulty-simulation.json

From the repository root:

    python scripts/verify-difficulty-vectors.py
    python scripts/verify-difficulty-simulation.py

## 10. Change Log

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-25 | Recorded the full deterministic comparison and selected 10-second/30-minute ASERT for isolated integration |
