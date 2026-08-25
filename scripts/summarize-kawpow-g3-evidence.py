#!/usr/bin/env python3
"""Summarize a locally archived, non-secret AIChain G3 evidence bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import statistics
from collections import Counter
from pathlib import Path


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def resource_summary(path: Path) -> dict[str, float | int | None]:
    records = json.loads(path.read_text(encoding="utf-8"))["records"]
    cpu = [float(record["cpuPercentOneCore"]) for record in records if "cpuPercentOneCore" in record]
    rss = [int(record["VmRSS"]) for record in records]
    disk = [int(record["dataDirBytes"]) for record in records]
    received = [int(record["networkReceiveBytes"]) for record in records]
    sent = [int(record["networkSendBytes"]) for record in records]
    gpu = [record["gpu"] for record in records if record.get("gpu")]
    return {
        "sampleCount": len(records),
        "durationSeconds": (records[-1]["observedNs"] - records[0]["observedNs"]) / 1e9,
        "meanCpuPercentOneCore": statistics.mean(cpu) if cpu else None,
        "p95CpuPercentOneCore": percentile(cpu, 0.95),
        "maxCpuPercentOneCore": max(cpu) if cpu else None,
        "meanRssBytes": statistics.mean(rss),
        "maxRssBytes": max(rss),
        "diskGrowthBytes": disk[-1] - disk[0],
        "networkReceiveDeltaBytes": received[-1] - received[0],
        "networkSendDeltaBytes": sent[-1] - sent[0],
        "meanGpuUtilizationPercent": statistics.mean(float(row["utilizationPercent"]) for row in gpu) if gpu else None,
        "meanGpuPowerW": statistics.mean(float(row["powerW"]) for row in gpu) if gpu else None,
        "maxGpuMemoryMiB": max(float(row["memoryMiB"]) for row in gpu) if gpu else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("evidence_root", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    root = args.evidence_root.resolve()
    vast = root / "raw" / "vast" / "evidence"
    vps = root / "raw" / "vps" / "g3-evidence"

    avr = {}
    for path in sorted(vast.glob("avr-*.json")):
        report = json.loads(path.read_text(encoding="utf-8"))
        avr[path.stem] = {key: report.get(key) for key in (
            "transactionCount", "logicalReceiptCount", "broadcastTransactionTps",
            "broadcastLogicalReceiptTps", "allConfirmedTransactionTps",
            "allConfirmedLogicalReceiptTps", "allConfirmedSeconds", "meanGasUsed"
        ) if key in report}

    statuses: Counter[str] = Counter()
    for path in vast.glob("*adapter-audit*.jsonl"):
        for line in path.read_text(encoding="utf-8").splitlines():
            statuses[json.loads(line).get("status", "unknown")] += 1

    import_ms = []
    for match in re.finditer(r"Imported new chain segment.*?elapsed=\"?([0-9.]+)(µs|ms|s)",
                             (vps / "validator-r4-node.log").read_text(encoding="utf-8", errors="replace")):
        value, unit = float(match.group(1)), match.group(2)
        import_ms.append(value / 1000 if unit == "µs" else value * 1000 if unit == "s" else value)

    files = {}
    for path in sorted(candidate for candidate in root.rglob("*") if candidate.is_file() and candidate != args.output):
        files[str(path.relative_to(root)).replace("\\", "/")] = hashlib.sha256(path.read_bytes()).hexdigest()

    result = {
        "schema": "aichain.kawpow-g3-evidence-summary",
        "schemaVersion": "0.1.0-draft",
        "resourceMetrics": {
            "gpuMiningNode": resource_summary(vast / "resources-miner-300s.json"),
            "cpuOnlyValidator": resource_summary(vps / "resources-validator-300s.json"),
        },
        "validatorImportLatencyMs": {
            "sampleCount": len(import_ms),
            "mean": statistics.mean(import_ms) if import_ms else None,
            "p95": percentile(import_ms, 0.95),
            "max": max(import_ms) if import_ms else None,
        },
        "adapterSubmissionStatuses": dict(statuses),
        "avrBenchmarks": avr,
        "fileSha256": files,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("resourceMetrics", "validatorImportLatencyMs", "adapterSubmissionStatuses", "avrBenchmarks")}, indent=2))


if __name__ == "__main__":
    main()
