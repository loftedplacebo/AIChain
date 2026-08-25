#!/usr/bin/env python3
"""Capture bounded Linux process, storage, network and optional NVIDIA metrics."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import time
from pathlib import Path


def read_status(pid: int) -> dict[str, int]:
    values: dict[str, int] = {}
    for line in Path(f"/proc/{pid}/status").read_text().splitlines():
        key, _, raw = line.partition(":")
        if key in {"VmRSS", "VmSize"}:
            values[key] = int(raw.strip().split()[0]) * 1024
    for line in Path(f"/proc/{pid}/io").read_text().splitlines():
        key, raw = line.split(":", 1)
        if key in {"read_bytes", "write_bytes"}:
            values[key] = int(raw.strip())
    stat = Path(f"/proc/{pid}/stat").read_text().split()
    values["cpuTicks"] = int(stat[13]) + int(stat[14])
    return values


def network_bytes(interface: str) -> tuple[int, int]:
    for line in Path("/proc/net/dev").read_text().splitlines():
        if ":" not in line:
            continue
        name, raw = line.split(":", 1)
        if name.strip() == interface:
            fields = raw.split()
            return int(fields[0]), int(fields[8])
    raise RuntimeError(f"network interface not found: {interface}")


def disk_bytes(path: Path) -> int:
    output = subprocess.check_output(["du", "-sb", str(path)], text=True)
    return int(output.split()[0])


def gpu_metrics() -> dict[str, float | str] | None:
    if shutil.which("nvidia-smi") is None:
        return None
    fields = "name,utilization.gpu,memory.used,temperature.gpu,power.draw"
    raw = subprocess.check_output(["nvidia-smi", f"--query-gpu={fields}", "--format=csv,noheader,nounits"], text=True).strip()
    if not raw:
        return None
    name, util, memory, temperature, power = [part.strip() for part in raw.split(",")]
    return {"name": name, "utilizationPercent": float(util), "memoryMiB": float(memory),
            "temperatureC": float(temperature), "powerW": float(power)}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pid", type=int, required=True)
    parser.add_argument("--data-dir", type=Path, required=True)
    parser.add_argument("--interface", default="eth0")
    parser.add_argument("--duration", type=float, default=300)
    parser.add_argument("--interval", type=float, default=1)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"refusing to overwrite {args.output}")
    ticks_per_second = os.sysconf("SC_CLK_TCK")
    records = []
    previous = None
    deadline = time.monotonic() + args.duration
    while time.monotonic() < deadline:
        now = time.time_ns()
        process = read_status(args.pid)
        received, sent = network_bytes(args.interface)
        record = {"observedNs": now, **process, "networkReceiveBytes": received,
                  "networkSendBytes": sent, "dataDirBytes": disk_bytes(args.data_dir), "gpu": gpu_metrics()}
        if previous is not None:
            elapsed = (now - previous["observedNs"]) / 1e9
            record["cpuPercentOneCore"] = (process["cpuTicks"] - previous["cpuTicks"]) / ticks_per_second / elapsed * 100
        records.append(record)
        previous = record
        time.sleep(args.interval)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"schema":"aichain.kawpow-g3-resource-samples",
        "schemaVersion":"0.1.0-draft","pid":args.pid,"interface":args.interface,"records":records}, indent=2)+"\n")
    print(f"wrote {len(records)} samples to {args.output}")


if __name__ == "__main__":
    main()

