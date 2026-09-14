#!/usr/bin/env python3
"""Reconcile accepted KawPoW submission audit entries with a loopback node."""

from __future__ import annotations

import argparse
import hashlib
import ipaddress
import json
import sys
import urllib.request
from collections import Counter
from pathlib import Path
from typing import Any
from urllib.parse import urlparse


def loopback_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise argparse.ArgumentTypeError("node RPC URL must be HTTP(S) on loopback")
    if parsed.hostname != "localhost":
        try:
            if not ipaddress.ip_address(parsed.hostname).is_loopback:
                raise ValueError
        except ValueError as error:
            raise argparse.ArgumentTypeError("node RPC URL must be HTTP(S) on loopback") from error
    return value


class RPC:
    def __init__(self, url: str):
        self.url = url
        self.request_id = 0

    def call(self, method: str, params: list[Any]) -> Any:
        self.request_id += 1
        body = json.dumps({"jsonrpc": "2.0", "id": self.request_id,
                           "method": method, "params": params}).encode()
        request = urllib.request.Request(self.url, body, {"Content-Type": "application/json"})
        with urllib.request.urlopen(request, timeout=10) as response:
            decoded = json.load(response)
        if decoded.get("error"):
            raise RuntimeError(decoded["error"].get("message", "node RPC error"))
        return decoded.get("result")


def canonicality(rpc: RPC, block_hash: str) -> str:
    block = rpc.call("eth_getBlockByHash", [block_hash, False])
    if not isinstance(block, dict) or not isinstance(block.get("number"), str):
        return "not-found"
    head_at_height = rpc.call("eth_getBlockByNumber", [block["number"], False])
    if not isinstance(head_at_height, dict):
        return "unavailable"
    return "canonical" if str(head_at_height.get("hash", "")).lower() == block_hash.lower() else "orphaned"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_log", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--node-rpc", type=loopback_url, default="http://127.0.0.1:8545")
    args = parser.parse_args()
    if not args.audit_log.is_file():
        parser.error("audit log must be an existing file")
    if args.output.exists():
        parser.error("output must not already exist")

    raw = args.audit_log.read_bytes()
    entries = [json.loads(line) for line in raw.decode().splitlines() if line.strip()]
    outcomes = Counter(str(entry.get("submissionOutcome", "unknown")) for entry in entries)
    reconciled: list[dict[str, Any]] = []
    rpc = RPC(args.node_rpc)
    for entry in entries:
        block_hash = entry.get("blockHash")
        if entry.get("accepted") is True and isinstance(block_hash, str) and len(block_hash) == 66:
            status = canonicality(rpc, block_hash)
            reconciled.append({"workId": entry.get("workId"), "blockHash": block_hash,
                               "canonicality": status})

    report = {
        "version": "0.1.0-dev",
        "auditLogSha256": hashlib.sha256(raw).hexdigest(),
        "records": len(entries),
        "submissionOutcomes": dict(sorted(outcomes.items())),
        "reportedAcceptedBlocks": len(reconciled),
        "canonicality": dict(sorted(Counter(item["canonicality"] for item in reconciled).items())),
        "blocks": reconciled,
        "note": "A reported accepted block is only canonical when independently matched to the node's canonical block at its height.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(f"Reconciliation report written to: {args.output}")


if __name__ == "__main__":
    main()
