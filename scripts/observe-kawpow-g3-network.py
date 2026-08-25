#!/usr/bin/env python3
"""Measure block arrival on a G3 mining node and independent validator."""

from __future__ import annotations

import argparse
import json
import statistics
import time
import urllib.request
from pathlib import Path


def rpc(url: str, method: str, params: list[object]) -> object:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        result = json.load(response)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result["result"]


def percentile(values: list[float], fraction: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round((len(ordered) - 1) * fraction))]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mining-rpc", default="http://127.0.0.1:18545")
    parser.add_argument("--validator-rpc", default="http://127.0.0.1:18546")
    parser.add_argument("--blocks", type=int, default=20)
    parser.add_argument("--timeout", type=float, default=300)
    parser.add_argument("--poll-ms", type=float, default=25)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.blocks <= 0 or args.timeout <= 0 or args.poll_ms <= 0:
        parser.error("blocks, timeout and poll-ms must be positive")
    if args.output.exists():
        parser.error(f"refusing to overwrite {args.output}")

    start_height = int(rpc(args.mining_rpc, "eth_blockNumber", []), 16)
    target_height = start_height + args.blocks
    started = time.time_ns()
    deadline = time.monotonic() + args.timeout
    mining_seen: dict[int, tuple[str, int]] = {}
    validator_seen: dict[int, tuple[str, int]] = {}
    last_mining = start_height
    last_validator = int(rpc(args.validator_rpc, "eth_blockNumber", []), 16)

    while time.monotonic() < deadline:
        now = time.time_ns()
        mining_height = int(rpc(args.mining_rpc, "eth_blockNumber", []), 16)
        validator_height = int(rpc(args.validator_rpc, "eth_blockNumber", []), 16)
        for height in range(last_mining + 1, mining_height + 1):
            block = rpc(args.mining_rpc, "eth_getBlockByNumber", [hex(height), False])
            mining_seen[height] = (block["hash"], now)
        for height in range(last_validator + 1, validator_height + 1):
            block = rpc(args.validator_rpc, "eth_getBlockByNumber", [hex(height), False])
            validator_seen[height] = (block["hash"], now)
        last_mining, last_validator = mining_height, validator_height
        if mining_height >= target_height and validator_height >= target_height:
            break
        time.sleep(args.poll_ms / 1000)
    else:
        raise SystemExit(f"timed out: mining={last_mining}, validator={last_validator}, target={target_height}")

    rows = []
    for height in range(start_height + 1, target_height + 1):
        mining_hash, mining_ns = mining_seen[height]
        validator_hash, validator_ns = validator_seen[height]
        rows.append({"height": height, "hash": mining_hash,
                     "validatorHash": validator_hash,
                     "sameCanonicalHash": mining_hash == validator_hash,
                     "miningObservedNs": mining_ns, "validatorObservedNs": validator_ns,
                     "propagationObservationMs": (validator_ns - mining_ns) / 1_000_000})
    if not all(row["sameCanonicalHash"] for row in rows):
        raise SystemExit("validator observed a different canonical hash")
    production = [(rows[index]["miningObservedNs"] - rows[index-1]["miningObservedNs"]) / 1_000_000
                  for index in range(1, len(rows))]
    propagation = [max(0.0, row["propagationObservationMs"]) for row in rows]
    result = {
        "schema": "aichain.kawpow-g3-network-observation", "schemaVersion": "0.1.0-draft",
        "startedNs": started, "startHeight": start_height, "endHeight": target_height,
        "pollIntervalMs": args.poll_ms,
        "blockProductionMs": {"samples": production, "mean": statistics.mean(production) if production else None,
                              "p50": percentile(production, .50), "p95": percentile(production, .95)},
        "propagationObservationMs": {"samples": propagation, "mean": statistics.mean(propagation),
                                     "p50": percentile(propagation, .50), "p95": percentile(propagation, .95),
                                     "measurementFloorMs": args.poll_ms},
        "blocks": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"startHeight": start_height, "endHeight": target_height,
                      "meanBlockProductionMs": result["blockProductionMs"]["mean"],
                      "p95PropagationObservationMs": result["propagationObservationMs"]["p95"]}, indent=2))


if __name__ == "__main__":
    main()

