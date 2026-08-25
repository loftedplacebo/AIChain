#!/usr/bin/env python3
"""Independently verify AIChain's committed integer ASERT vectors."""

import json
import sys
from pathlib import Path


def calculate_target(vector_set, vector):
    target_seconds = int(vector_set["TargetSeconds"])
    half_life = int(vector_set["HalfLife"])
    anchor_height = int(vector_set["AnchorHeight"])
    anchor_time = int(vector_set["AnchorTime"])
    anchor_target = int(vector_set["AnchorTarget"])
    minimum_target = int(vector_set["MinTarget"])
    maximum_target = int(vector_set["MaxTarget"])

    height_delta = int(vector["CandidateHeight"]) - anchor_height
    time_delta = int(vector["CandidateTimestamp"]) - anchor_time
    schedule_error = time_delta - target_seconds * height_delta
    exponent = (schedule_error * 65536) // half_life
    shifts = exponent // 65536
    fraction = exponent - shifts * 65536
    factor = 65536 + (
        195766423245049 * fraction
        + 971821376 * fraction * fraction
        + 5127 * fraction * fraction * fraction
        + (1 << 47)
    ) // (1 << 48)

    target = anchor_target * factor
    shifts -= 16
    target = target >> -shifts if shifts < 0 else target << shifts
    return min(max(target, minimum_target), maximum_target)


def main():
    default_path = (
        Path(__file__).resolve().parents[1]
        / "spikes"
        / "difficulty-simulator"
        / "testdata"
        / "asert_vectors.json"
    )
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else default_path
    vector_set = json.loads(path.read_text(encoding="utf-8"))
    failures = []
    for vector in vector_set["Vectors"]:
        actual = calculate_target(vector_set, vector)
        expected = int(vector["ExpectedTarget"])
        if actual != expected:
            failures.append((vector["Name"], actual, expected))
    if failures:
        for name, actual, expected in failures:
            print(f"{name}: have {actual}, want {expected}", file=sys.stderr)
        return 1
    print(f"Verified {len(vector_set['Vectors'])} independent ASERT vectors from {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
