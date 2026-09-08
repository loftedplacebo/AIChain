#!/usr/bin/env python3
"""Collect one private, public-safe Phase 4 node snapshot from loopback RPC."""

from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


HEX_32 = re.compile(r"^0x[0-9a-fA-F]{64}$")


def loopback_url(value: str) -> str:
    parsed = urllib.parse.urlparse(value)
    if parsed.scheme not in {"http", "https"} or parsed.hostname not in {"127.0.0.1", "localhost", "::1"}:
        raise argparse.ArgumentTypeError("RPC URL must use a loopback host")
    return value


def build_id(value: str) -> str:
    if not HEX_32.fullmatch(value):
        raise argparse.ArgumentTypeError("build ID must be a 32-byte 0x-prefixed digest")
    return value.lower()


def rpc(url: str, method: str, params: list[Any]) -> Any:
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = json.load(response)
    if payload.get("error"):
        raise RuntimeError(payload["error"])
    return payload["result"]


def process_metrics(pid: int, data_dir: Path, interface: str) -> dict[str, int]:
    if os.name != "posix":
        raise RuntimeError("process metrics currently require Linux /proc")
    status: dict[str, int] = {}
    for line in Path(f"/proc/{pid}/status").read_text(encoding="utf-8").splitlines():
        key, _, raw = line.partition(":")
        if key in {"VmRSS", "VmSize"}:
            status[key] = int(raw.strip().split()[0]) * 1024
    for line in Path(f"/proc/{pid}/io").read_text(encoding="utf-8").splitlines():
        key, raw = line.split(":", 1)
        if key in {"read_bytes", "write_bytes"}:
            status[key] = int(raw.strip())
    stat = Path(f"/proc/{pid}/stat").read_text(encoding="utf-8").split()
    status["cpuTicks"] = int(stat[13]) + int(stat[14])
    for line in Path("/proc/net/dev").read_text(encoding="utf-8").splitlines():
        if ":" in line and line.split(":", 1)[0].strip() == interface:
            fields = line.split(":", 1)[1].split()
            status["networkReceiveBytes"] = int(fields[0])
            status["networkSendBytes"] = int(fields[8])
            break
    else:
        raise RuntimeError(f"network interface not found: {interface}")
    status["dataDirBytes"] = sum(path.stat().st_size for path in data_dir.rglob("*") if path.is_file())
    return status


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--role", choices=("miner", "validator", "ingress", "indexer"), required=True)
    parser.add_argument("--rpc-url", type=loopback_url, required=True)
    parser.add_argument("--build-id", type=build_id, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--expected-genesis", type=build_id)
    parser.add_argument("--expected-chain-id", type=int)
    parser.add_argument("--pid", type=int)
    parser.add_argument("--data-dir", type=Path)
    parser.add_argument("--interface", default="eth0")
    args = parser.parse_args()
    if args.output.exists():
        parser.error(f"refusing to overwrite {args.output}")
    if (args.pid is None) != (args.data_dir is None):
        parser.error("--pid and --data-dir must be supplied together")
    if args.data_dir and not args.data_dir.is_dir():
        parser.error("--data-dir must be an existing directory")

    genesis = rpc(args.rpc_url, "eth_getBlockByNumber", ["0x0", False])
    head = rpc(args.rpc_url, "eth_getBlockByNumber", ["latest", False])
    if not isinstance(genesis, dict) or not isinstance(head, dict) or not genesis.get("hash") or not head.get("hash"):
        raise SystemExit("RPC returned incomplete genesis or head block")
    chain_id = int(rpc(args.rpc_url, "eth_chainId", []), 16)
    if args.expected_genesis and genesis["hash"].lower() != args.expected_genesis:
        raise SystemExit("genesis mismatch")
    if args.expected_chain_id is not None and chain_id != args.expected_chain_id:
        raise SystemExit("chain ID mismatch")

    snapshot: dict[str, Any] = {
        "schema": "aichain.phase4-private-metrics-snapshot",
        "schemaVersion": "0.1.0-draft",
        "role": args.role,
        "observedNs": time.time_ns(),
        "rpcScope": "loopback",
        "buildId": args.build_id,
        "chainId": chain_id,
        "genesisHash": genesis["hash"].lower(),
        "head": {"number": int(head["number"], 16), "hash": head["hash"].lower(), "timestamp": int(head["timestamp"], 16)},
        "peerCount": int(rpc(args.rpc_url, "net_peerCount", []), 16),
        "syncing": rpc(args.rpc_url, "eth_syncing", []),
    }
    if args.pid is not None:
        snapshot["process"] = process_metrics(args.pid, args.data_dir, args.interface)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(snapshot, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"role": args.role, "chainId": chain_id, "head": snapshot["head"]["number"], "peerCount": snapshot["peerCount"]}, indent=2))


if __name__ == "__main__":
    main()
