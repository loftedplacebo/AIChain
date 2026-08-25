# AIChain Difficulty Simulator

This isolated Go module compares candidate difficulty-adjustment behavior. It
does not modify Core-Geth, activate KawPoW, or select production parameters.

The consensus-style calculators use integer arithmetic. Floating point is used
only by the Monte Carlo sampling and metrics layer.

## Run

From this directory:

    go test ./...
    go run . -out ../../benchmarks/pow/runs/2026-08-25-difficulty-simulation.json

Use the -quick flag for a small development matrix. The full run includes at
least 100,000 stable-hash blocks for every configuration, hash-rate shocks,
rental cycling, gradual changes, timestamp strategies, and 50/50, 70/30, and
90/10 partitions.

The base seed defaults to 20260825. Each scenario derives a deterministic seed
from that value and its name, allowing candidate algorithms to consume the same
random stream.

Run the independent vector implementation from the repository root:

    python scripts/verify-difficulty-vectors.py

## Model limits

- This is a discrete-block Monte Carlo model, not a packet-level network model.
- A work template is sampled from the candidate difficulty at the nominal next
  timestamp; the submitted block then receives the exact integer difficulty
  for its final timestamp.
- The retained Core-Geth rule requiring a strictly increasing timestamp and no
  more than 15 seconds of future skew is enforced.
- Partition branches are compared by accumulated verified work over one hour.
- Network propagation and natural stale rates require the later multi-host
  disposable-network trial.
