#!/usr/bin/env python3
"""Verify the completeness and development gates of a difficulty report."""

import hashlib
import json
import re
import sys
from pathlib import Path


def fail(message):
    raise AssertionError(message)


def main():
    default_path = (
        Path(__file__).resolve().parents[1]
        / "benchmarks"
        / "pow"
        / "runs"
        / "2026-08-25-difficulty-simulation.json"
    )
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    payload = path.read_bytes()
    report = json.loads(payload)
    runs = report["Runs"]
    partitions = report["Partitions"]

    if len(runs) != 273:
        fail(f"expected 273 scenario runs, found {len(runs)}")
    if len(partitions) != 63:
        fail(f"expected 63 partition runs, found {len(partitions)}")

    stable = [run for run in runs if run["Scenario"] == "stable"]
    if len(stable) != 21:
        fail(f"expected 21 stable runs, found {len(stable)}")
    if any(run["Blocks"] < 100_000 for run in stable):
        fail("every stable configuration must include at least 100,000 blocks")
    if any(not re.fullmatch(r"[0-9a-f]{64}", run["DeterministicTraceSHA256"]) for run in runs):
        fail("one or more deterministic trace hashes are malformed")
    if any(run["TimestampOffsetMaximum"] > 15.000001 for run in runs):
        fail("a simulated block exceeded the retained 15-second future limit")
    if any(run["FinalDifficultyRatio"] <= 0 or run["FinalDifficultyRatio"] > 1_000_001 for run in runs):
        fail("a run exceeded the configured positive difficulty bounds")

    asert_stable = [run for run in stable if run["Algorithm"].startswith("asert-")]
    if any(abs(run["MeanInterval"] - run["TargetSeconds"]) / run["TargetSeconds"] > 0.02 for run in asert_stable):
        fail("an ASERT stable run missed its target by more than two percent")

    shocks = {
        run["Scenario"]: run
        for run in runs
        if run["Algorithm"] == "asert-10s-hl1800"
        and run["Scenario"].startswith("step-")
    }
    if len(shocks) != 6 or any(run["RecoverySeconds"] <= 0 for run in shocks.values()):
        fail("the 10-second/30-minute ASERT candidate did not recover in every shock run")

    ethash_up = {
        run["Scenario"]: run
        for run in runs
        if run["Algorithm"] == "ethash-eip100-control"
        and run["TargetSeconds"] == 10
        and run["Scenario"].startswith("step-up-")
    }
    for scenario, control in ethash_up.items():
        candidate = shocks[scenario]
        if candidate["RecoverySeconds"] >= control["RecoverySeconds"]:
            fail(f"ASERT did not beat the Ethash control recovery for {scenario}")

    for partition in partitions:
        if partition["Split"] in {"70/30", "90/10"} and partition["WinningBranch"] != "A":
            fail(f"higher-hash branch lost accumulated-work selection: {partition}")

    digest = hashlib.sha256(payload).hexdigest()
    candidate = next(
        run for run in stable
        if run["Algorithm"] == "asert-10s-hl1800"
    )
    print(f"Verified {len(runs)} scenario runs and {len(partitions)} partition runs")
    print(f"Report SHA-256: {digest}")
    print(
        "10s/30m ASERT stable mean/p95/CV: "
        f"{candidate['MeanInterval']:.3f}s / "
        f"{candidate['P95Interval']:.3f}s / "
        f"{candidate['DifficultyCV']:.4f}"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
