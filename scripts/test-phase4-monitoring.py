#!/usr/bin/env python3
"""Regression checks for the non-controlling Phase 4 alert evaluator."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
POLICY = ROOT / "config" / "phase4-monitoring-alert-policy-v0.1.0-draft.json"
EVALUATOR = ROOT / "scripts" / "evaluate-phase4-alerts.py"
GENESIS = "0x" + "11" * 32
BUILD = "0x" + "22" * 32


def snapshot(role: str, *, peer_count: int = 1, head_hash: str = "0x" + "33" * 32, genesis: str = GENESIS, build: str = BUILD) -> dict[str, object]:
    return {
        "schema": "aichain.phase4-private-metrics-snapshot",
        "schemaVersion": "0.1.0-draft",
        "role": role,
        "observedNs": 1,
        "rpcScope": "loopback",
        "buildId": build,
        "chainId": 2026091301,
        "genesisHash": genesis,
        "head": {"number": 9, "hash": head_hash, "timestamp": 1},
        "peerCount": peer_count,
        "syncing": False,
    }


def write(path: Path, value: dict[str, object]) -> None:
    path.write_text(json.dumps(value), encoding="utf-8")


def evaluate(directory: Path, *files: Path, required: tuple[str, ...] = ("miner", "validator")) -> dict[str, object]:
    output = directory / f"result-{len(list(directory.glob('result-*.json')))}.json"
    command = [sys.executable, str(EVALUATOR), "--policy", str(POLICY)]
    for path in files:
        command += ["--snapshot", str(path)]
    for role in required:
        command += ["--require-role", role]
    subprocess.run(command + ["--output", str(output)], check=True, capture_output=True, text=True)
    return json.loads(output.read_text(encoding="utf-8"))


def main() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        miner = directory / "miner.json"
        validator = directory / "validator.json"
        write(miner, snapshot("miner"))
        write(validator, snapshot("validator"))
        assert evaluate(directory, miner, validator)["status"] == "normal"

        no_peer = directory / "no-peer.json"
        write(no_peer, snapshot("validator", peer_count=0))
        assert evaluate(directory, miner, no_peer)["status"] == "warning"

        divergent = directory / "divergent.json"
        write(divergent, snapshot("validator", head_hash="0x" + "44" * 32))
        assert evaluate(directory, miner, divergent)["status"] == "critical"

        mismatch = directory / "mismatch.json"
        write(mismatch, snapshot("validator", genesis="0x" + "55" * 32))
        assert evaluate(directory, miner, mismatch)["status"] == "critical"

        missing = evaluate(directory, miner)
        assert missing["status"] == "warning"
        assert any(alert.get("detail") == "required role absent: validator" for alert in missing["alerts"])

    print("Phase 4 private monitoring regression checks passed.")


if __name__ == "__main__":
    main()
