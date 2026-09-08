#!/usr/bin/env python3
"""Evaluate private Phase 4 snapshots against alert rules; never controls nodes."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def read_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"Cannot read {path}: {error}") from error
    if not isinstance(value, dict):
        raise SystemExit(f"Expected JSON object: {path}")
    return value


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--policy", type=Path, required=True)
    parser.add_argument("--snapshot", type=Path, action="append", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"refusing to overwrite {args.output}")
    policy = read_json(args.policy)
    if policy.get("schema") != "aichain.phase4-monitoring-alert-policy" or policy.get("schemaVersion") != "0.1.0-draft":
        raise SystemExit("unsupported alert policy")
    snapshots = [read_json(path) for path in args.snapshot]
    if not all(row.get("schema") == "aichain.phase4-private-metrics-snapshot" for row in snapshots):
        raise SystemExit("unsupported snapshot schema")

    alerts: list[dict[str, str]] = []
    genesis = {row.get("genesisHash") for row in snapshots}
    builds = {row.get("buildId") for row in snapshots}
    if len(genesis) != 1 or len(builds) != 1:
        alerts.append({"id": "genesis-or-build-mismatch", "severity": "critical"})
    heads: dict[int, set[str]] = {}
    for row in snapshots:
        head = row.get("head", {})
        if isinstance(head.get("number"), int) and isinstance(head.get("hash"), str):
            heads.setdefault(head["number"], set()).add(head["hash"])
        if row.get("role") in {"miner", "validator"} and int(row.get("peerCount", 0)) < 1:
            alerts.append({"id": "block-or-peer-degradation", "severity": "warning"})
    if any(len(hashes) > 1 for hashes in heads.values()):
        alerts.append({"id": "canonical-divergence-or-invalid-acceptance", "severity": "critical"})
    severity_rank = {"normal": 0, "warning": 1, "critical": 2}
    status = max((alert["severity"] for alert in alerts), key=lambda value: severity_rank[value], default="normal")
    result = {
        "schema": "aichain.phase4-alert-evaluation",
        "schemaVersion": "0.1.0-draft",
        "status": status,
        "automatedControls": "none; evaluator does not connect to or control nodes",
        "policySha256": digest(args.policy),
        "snapshotSha256": {path.name: digest(path) for path in args.snapshot},
        "alerts": alerts,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": status, "alertCount": len(alerts)}, indent=2))


if __name__ == "__main__":
    main()
