#!/usr/bin/env python3
"""Regression checks for the non-controlling Phase 4 fault/report tooling."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
POLICY = ROOT / "config" / "phase4-acceptance-policy-v0.1.0-draft.json"
PLAN = ROOT / "fixtures" / "phase4" / "fault-plan-v0.1.0-draft.json"
PLAN_VALIDATOR = ROOT / "scripts" / "validate-phase4-fault-plan.py"
REPORTER = ROOT / "scripts" / "generate-phase4-acceptance-report.py"


def write(path: Path, value: dict[str, object]) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def resources() -> dict[str, object]:
    return {
        "schema": "aichain.kawpow-g3-resource-samples",
        "schemaVersion": "0.1.0-draft",
        "records": [
            {"observedNs": 0, "cpuPercentOneCore": 40, "VmRSS": 1_000_000, "dataDirBytes": 10_000},
            {"observedNs": 86_400_000_000_000, "cpuPercentOneCore": 50, "VmRSS": 1_500_000, "dataDirBytes": 20_000},
        ],
    }


def observation(stale_rate: float) -> dict[str, object]:
    return {
        "schema": "aichain.kawpow-g3-network-observation",
        "schemaVersion": "0.1.0-draft",
        "startHeight": 0,
        "endHeight": 1000,
        "blockProductionMs": {"mean": 10_000, "p95": 12_000, "p99": 14_000},
        "propagationObservationMs": {"p95": 1_000},
        "naturalStaleRate": stale_rate,
        "candidateBlockCount": 1_010,
        "blocks": [{"sameCanonicalHash": True} for _ in range(1000)],
    }


def faults() -> dict[str, object]:
    return {
        "schema": "aichain.phase4-fault-results",
        "schemaVersion": "0.1.0-draft",
        "experiments": [
            {"id": "partition", "kind": "partition", "status": "passed"},
            {"id": "restart", "kind": "restart", "status": "passed"},
            {"id": "reorg", "kind": "reorg", "status": "passed", "metrics": {
                "controlledReorgRecoverySeconds": 30,
                "validatorVerificationP95Ms": 100,
                "validatorVerificationMaxMs": 500,
            }},
            {"id": "malformed", "kind": "malformed-submission", "status": "passed", "metrics": {
                "proofQueueP95Ms": 120_000,
                "onChainVerificationGas": 300_000,
                "proofBytes": 260,
                "journalBytes": 714,
                "malformedAndBindingRejected": True,
            }},
            {"id": "load", "kind": "load", "status": "passed", "metrics": {
                "ingressP95Ms": 50,
                "batchInclusionP95Ms": 10_000,
                "confirmedLogicalReceiptTpsAtBatch100": 60,
                "indexerLagBlocks": 1,
                "indexerRebuildSeconds": 120,
            }},
        ],
    }


def report(directory: Path, stale_rate: float, name: str) -> dict[str, object]:
    fault_path, network_path = directory / f"{name}-faults.json", directory / f"{name}-network.json"
    miner_path, validator_path, output = (directory / f"{name}-miner.json", directory / f"{name}-validator.json", directory / f"{name}-report.json")
    write(fault_path, faults())
    write(network_path, observation(stale_rate))
    write(miner_path, resources())
    write(validator_path, resources())
    subprocess.run([
        sys.executable, str(REPORTER), "--policy", str(POLICY), "--fault-results", str(fault_path),
        "--network-observation", str(network_path), "--miner-resources", str(miner_path),
        "--validator-resources", str(validator_path), "--output", str(output),
    ], check=True, capture_output=True, text=True)
    return json.loads(output.read_text(encoding="utf-8"))


def main() -> None:
    subprocess.run([sys.executable, str(PLAN_VALIDATOR), str(PLAN)], check=True, capture_output=True, text=True)
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        healthy = report(directory, 0.01, "healthy")
        assert healthy["status"] == "review-required"
        assert all(check["passed"] for check in healthy["policyEvaluation"]["checks"])
        stale = report(directory, 0.10, "stale")
        assert stale["status"] == "threshold-breach"
        assert any(check["id"] == "network.natural-stale-rate" and not check["passed"]
                   for check in stale["policyEvaluation"]["checks"])
    print("Phase 4 fault-plan and acceptance-report regression checks passed.")


if __name__ == "__main__":
    main()
