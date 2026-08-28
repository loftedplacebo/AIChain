#!/usr/bin/env python3
"""Capture reproducible block-timing and work-submission evidence from an ASERT trial."""

import argparse
import json
import math
import statistics
import urllib.request
from collections import Counter
from pathlib import Path


def rpc(url, method, params=None):
    request = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload["result"]


def percentile(values, fraction):
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, math.ceil(fraction * len(ordered)) - 1)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--rpc", default="http://127.0.0.1:18545")
    parser.add_argument("--target", type=int, choices=(5, 10, 15), required=True)
    parser.add_argument("--blocks", type=int, default=100)
    parser.add_argument("--audit-log", type=Path)
    parser.add_argument("--topology", default="RTX miner; VPS and laptop CPU validators")
    args = parser.parse_args()
    if args.output.exists():
        raise SystemExit(f"refusing to overwrite {args.output}")

    tip = int(rpc(args.rpc, "eth_blockNumber"), 16)
    first = max(0, tip - max(2, args.blocks) + 1)
    blocks = [rpc(args.rpc, "eth_getBlockByNumber", [hex(height), False]) for height in range(first, tip + 1)]
    timestamps = [int(block["timestamp"], 16) for block in blocks]
    intervals = [right - left for left, right in zip(timestamps, timestamps[1:])]
    transactions = sum(len(block["transactions"]) for block in blocks)
    statuses = Counter()
    accepted = []
    if args.audit_log and args.audit_log.exists():
        for line in args.audit_log.read_text(encoding="utf-8").splitlines():
            entry = json.loads(line)
            statuses[entry.get("status", "missing")] += 1
            if entry.get("accepted"):
                accepted.append(entry)

    result = {
        "schema": "aichain.kawpow-asert-live-trial",
        "schemaVersion": "0.1.0-draft",
        "scope": "disposable development chain; not production performance",
        "targetSeconds": args.target,
        "halfLifeSeconds": 1800,
        "topology": args.topology,
        "chainId": int(rpc(args.rpc, "eth_chainId"), 16),
        "sample": {
            "firstBlock": first,
            "lastBlock": tip,
            "blockCount": len(blocks),
            "transactionCount": transactions,
            "intervalCount": len(intervals),
            "meanIntervalSeconds": statistics.mean(intervals) if intervals else None,
            "medianIntervalSeconds": statistics.median(intervals) if intervals else None,
            "p95IntervalSeconds": percentile(intervals, 0.95),
            "minimumIntervalSeconds": min(intervals) if intervals else None,
            "maximumIntervalSeconds": max(intervals) if intervals else None,
            "meanDifficulty": statistics.mean(int(block["difficulty"], 16) for block in blocks),
        },
        "submissionAudit": {
            "statusCounts": dict(sorted(statuses.items())),
            "acceptedSolutions": len(accepted),
            "acceptedUniqueBlocks": len({entry.get("blockHash") for entry in accepted}),
        },
        "blocks": [
            {
                "number": int(block["number"], 16),
                "hash": block["hash"],
                "parentHash": block["parentHash"],
                "timestamp": int(block["timestamp"], 16),
                "difficulty": int(block["difficulty"], 16),
                "transactionCount": len(block["transactions"]),
            }
            for block in blocks
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"targetSeconds": args.target, **result["sample"], **result["submissionAudit"]}, indent=2))


if __name__ == "__main__":
    main()
