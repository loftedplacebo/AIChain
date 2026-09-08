#!/usr/bin/env python3
"""Produce a reviewed-metrics draft from Phase 4 observation files; never controls nodes."""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
from pathlib import Path
from typing import Any


REQUIRED_FAULT_KINDS = {"partition", "restart", "reorg", "malformed-submission", "load"}


def read_json(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot read {path}: {error}") from error
    if not isinstance(data, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return data


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[round((len(ordered) - 1) * fraction)]


def numeric_summary(values: list[object]) -> dict[str, float | int | None]:
    samples = [float(value) for value in values if isinstance(value, (int, float))]
    return {"samples": len(samples), "mean": statistics.mean(samples) if samples else None,
            "p50": percentile(samples, 0.5), "p95": percentile(samples, 0.95),
            "max": max(samples) if samples else None}


def resource_summary(path: Path) -> dict[str, Any]:
    data = read_json(path)
    records = data.get("records")
    if data.get("schema") != "aichain.kawpow-g3-resource-samples" or not isinstance(records, list):
        raise SystemExit(f"Unsupported resource sample schema: {path}")
    return {
        "sourceSha256": digest(path),
        "sampleCount": len(records),
        "cpuPercentOneCore": numeric_summary([row.get("cpuPercentOneCore") for row in records if isinstance(row, dict)]),
        "rssBytes": numeric_summary([row.get("VmRSS") for row in records if isinstance(row, dict)]),
        "dataDirBytes": numeric_summary([row.get("dataDirBytes") for row in records if isinstance(row, dict)]),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fault-results", type=Path, required=True,
                        help="Reviewed JSON object containing an experiments array; no commands/endpoints.")
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--network-observation", type=Path)
    parser.add_argument("--miner-resources", type=Path)
    parser.add_argument("--validator-resources", type=Path)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"Refusing to overwrite {args.output}")

    faults = read_json(args.fault_results)
    experiments = faults.get("experiments")
    if faults.get("schema") != "aichain.phase4-fault-results" or not isinstance(experiments, list):
        raise SystemExit("fault results must use aichain.phase4-fault-results and contain experiments")
    kinds: set[str] = set()
    failed: list[str] = []
    for experiment in experiments:
        if not isinstance(experiment, dict) or not isinstance(experiment.get("id"), str) or not isinstance(experiment.get("kind"), str):
            raise SystemExit("each fault result needs string id and kind")
        kinds.add(experiment["kind"])
        if experiment.get("status") != "passed":
            failed.append(experiment["id"])

    result: dict[str, Any] = {
        "schema": "aichain.phase4-acceptance-report",
        "schemaVersion": "0.1.0-draft",
        "status": "review-required",
        "automatedControls": "none; this report generator does not connect to or control nodes",
        "faultResultsSha256": digest(args.fault_results),
        "faultCoverage": {"observed": sorted(kinds), "missing": sorted(REQUIRED_FAULT_KINDS - kinds), "failed": failed},
        "measurements": {},
        "limitations": [
            "Thresholds require explicit Phase 4 approval; this report does not infer production readiness.",
            "Inputs must be reviewed public-safe aggregates; do not provide keys, raw evidence, credentials or private endpoints."
        ]
    }
    if args.network_observation:
        observation = read_json(args.network_observation)
        if observation.get("schema") != "aichain.kawpow-g3-network-observation":
            raise SystemExit("unsupported network observation schema")
        result["measurements"]["network"] = {
            "sourceSha256": digest(args.network_observation),
            "startHeight": observation.get("startHeight"), "endHeight": observation.get("endHeight"),
            "blockProductionMs": observation.get("blockProductionMs"),
            "propagationObservationMs": observation.get("propagationObservationMs"),
            "canonicalHashAgreement": all(row.get("sameCanonicalHash") for row in observation.get("blocks", []) if isinstance(row, dict)),
        }
    if args.miner_resources:
        result["measurements"]["minerResources"] = resource_summary(args.miner_resources)
    if args.validator_resources:
        result["measurements"]["validatorResources"] = resource_summary(args.validator_resources)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": result["status"], "faultCoverage": result["faultCoverage"],
                      "measurementGroups": sorted(result["measurements"])}, indent=2))


if __name__ == "__main__":
    main()
