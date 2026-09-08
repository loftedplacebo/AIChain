"""Regression tests for the non-executing Phase 4 planning/report tools."""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAN_VALIDATOR = ROOT / "scripts" / "validate-phase4-fault-plan.py"
REPORT_GENERATOR = ROOT / "scripts" / "generate-phase4-acceptance-report.py"
PLAN = ROOT / "fixtures" / "phase4" / "fault-plan-v0.1.0-draft.json"
RESULTS = ROOT / "fixtures" / "phase4" / "fault-results-synthetic-v0.1.0.json"
POLICY = ROOT / "config" / "phase4-acceptance-policy-v0.1.0-draft.json"


def test_controlled_fault_plan_requires_closed_testnet_and_approval(tmp_path: Path) -> None:
    valid = subprocess.run([sys.executable, str(PLAN_VALIDATOR), str(PLAN)], capture_output=True, text=True, check=True)
    assert '"status": "valid"' in valid.stdout

    invalid = json.loads(PLAN.read_text(encoding="utf-8"))
    invalid["approvalRequired"] = False
    path = tmp_path / "invalid-plan.json"
    path.write_text(json.dumps(invalid), encoding="utf-8")
    rejected = subprocess.run([sys.executable, str(PLAN_VALIDATOR), str(path)], capture_output=True, text=True)
    assert rejected.returncode != 0
    assert "approvalRequired" in rejected.stderr


def test_acceptance_report_is_review_only_and_identifies_coverage(tmp_path: Path) -> None:
    output = tmp_path / "report.json"
    completed = subprocess.run(
        [sys.executable, str(REPORT_GENERATOR), "--fault-results", str(RESULTS), "--output", str(output)],
        capture_output=True,
        text=True,
        check=True,
    )
    assert '"status": "review-required"' in completed.stdout
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["status"] == "review-required"
    assert report["automatedControls"].startswith("none")
    assert report["faultCoverage"]["missing"] == []
    assert report["faultCoverage"]["failed"] == []


def test_policy_refuses_to_treat_synthetic_evidence_as_a_real_acceptance_run(tmp_path: Path) -> None:
    output = tmp_path / "policy-report.json"
    subprocess.run(
        [sys.executable, str(REPORT_GENERATOR), "--policy", str(POLICY), "--fault-results", str(RESULTS), "--output", str(output)],
        capture_output=True,
        text=True,
        check=True,
    )
    report = json.loads(output.read_text(encoding="utf-8"))
    assert report["status"] == "synthetic-input"
    assert report["policyEvaluation"]["missingEvidence"] == ["real-testnet-evidence"]
