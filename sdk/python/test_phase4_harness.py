"""Regression tests for the non-executing Phase 4 planning/report tools."""

from __future__ import annotations

import json
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PLAN_VALIDATOR = ROOT / "scripts" / "validate-phase4-fault-plan.py"
REPORT_GENERATOR = ROOT / "scripts" / "generate-phase4-acceptance-report.py"
PLAN = ROOT / "fixtures" / "phase4" / "fault-plan-v0.1.0-draft.json"
RESULTS = ROOT / "fixtures" / "phase4" / "fault-results-synthetic-v0.1.0.json"
POLICY = ROOT / "config" / "phase4-acceptance-policy-v0.1.0-draft.json"
ALERT_POLICY = ROOT / "config" / "phase4-monitoring-alert-policy-v0.1.0-draft.json"
COLLECTOR = ROOT / "scripts" / "collect-phase4-metrics.py"
ALERT_EVALUATOR = ROOT / "scripts" / "evaluate-phase4-alerts.py"
BUILD_ID = "0x" + "11" * 32
GENESIS = "0x" + "22" * 32
HEAD = "0x" + "33" * 32


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


def test_loopback_collector_and_alert_evaluator(tmp_path: Path) -> None:
    class RpcHandler(BaseHTTPRequestHandler):
        def do_POST(self) -> None:  # noqa: N802
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            method = request["method"]
            if method == "eth_getBlockByNumber":
                result = {"hash": GENESIS, "number": "0x0", "timestamp": "0x0"} if request["params"][0] == "0x0" else {"hash": HEAD, "number": "0x7", "timestamp": "0x64"}
            else:
                result = {"eth_chainId": "0x539", "net_peerCount": "0x1", "eth_syncing": False}[method]
            body = json.dumps({"jsonrpc": "2.0", "id": 1, "result": result}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_: object) -> None:
            return

    server = ThreadingHTTPServer(("127.0.0.1", 0), RpcHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        snapshot = tmp_path / "snapshot.json"
        subprocess.run(
            [sys.executable, str(COLLECTOR), "--role", "validator", "--rpc-url", f"http://127.0.0.1:{server.server_port}",
             "--build-id", BUILD_ID, "--expected-genesis", GENESIS, "--expected-chain-id", "1337", "--output", str(snapshot)],
            capture_output=True, text=True, check=True,
        )
    finally:
        server.shutdown()
        thread.join()
    alert_output = tmp_path / "alerts.json"
    subprocess.run(
        [sys.executable, str(ALERT_EVALUATOR), "--policy", str(ALERT_POLICY), "--snapshot", str(snapshot), "--output", str(alert_output)],
        capture_output=True, text=True, check=True,
    )
    collected = json.loads(snapshot.read_text(encoding="utf-8"))
    alerts = json.loads(alert_output.read_text(encoding="utf-8"))
    assert collected["rpcScope"] == "loopback"
    assert collected["genesisHash"] == GENESIS
    assert alerts["status"] == "normal"


def test_alert_evaluator_escalates_identity_mismatch(tmp_path: Path) -> None:
    first = {
        "schema": "aichain.phase4-private-metrics-snapshot", "buildId": BUILD_ID,
        "genesisHash": GENESIS, "role": "validator", "peerCount": 1,
        "head": {"number": 7, "hash": HEAD},
    }
    second = {**first, "role": "miner", "genesisHash": "0x" + "44" * 32}
    first_path, second_path, output = tmp_path / "first.json", tmp_path / "second.json", tmp_path / "alerts.json"
    first_path.write_text(json.dumps(first), encoding="utf-8")
    second_path.write_text(json.dumps(second), encoding="utf-8")
    subprocess.run(
        [sys.executable, str(ALERT_EVALUATOR), "--policy", str(ALERT_POLICY), "--snapshot", str(first_path), "--snapshot", str(second_path), "--output", str(output)],
        capture_output=True, text=True, check=True,
    )
    alerts = json.loads(output.read_text(encoding="utf-8"))
    assert alerts["status"] == "critical"
    assert alerts["alerts"] == [{"id": "genesis-or-build-mismatch", "severity": "critical"}]
