#!/usr/bin/env python3
"""Validate a non-secret disposable KawPoW GPU fleet inventory."""
import ipaddress
import json
import sys
from pathlib import Path


def fail(message):
    raise SystemExit(f"inventory error: {message}")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(f"usage: {sys.argv[0]} /absolute/gpu-fleet.json")
    path = Path(sys.argv[1])
    if not path.is_absolute() or not path.is_file():
        fail("inventory must be an existing absolute file")
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schema") != "aichain.kawpow-gpu-fleet":
        fail("unsupported schema")
    if data.get("scope") != "disposable development network only":
        fail("scope must be disposable development network only")
    identity = data.get("sshIdentity")
    if not isinstance(identity, str) or not identity.startswith("/"):
        fail("sshIdentity must be an absolute path and is never committed")
    hosts = data.get("hosts")
    if not isinstance(hosts, list) or len(hosts) < 2:
        fail("at least two miner hosts are required")
    ids, regions = set(), set()
    for host in hosts:
        if not isinstance(host, dict) or host.get("role") != "miner":
            fail("each host must be a miner object")
        for field in ("id", "region", "address", "user", "expectedGpu", "computeCapability"):
            if not isinstance(host.get(field), str) or not host[field]:
                fail(f"host has invalid {field}")
        if host["id"] in ids or host["region"] in regions:
            fail("host ids and regions must be unique")
        ids.add(host["id"]); regions.add(host["region"])
        try:
            ipaddress.ip_address(host["address"])
        except ValueError:
            fail(f"{host['id']} address must be an IP address")
        if not isinstance(host.get("port"), int) or not 1 <= host["port"] <= 65535:
            fail(f"{host['id']} has invalid SSH port")
    print(json.dumps({"valid": True, "minerCount": len(hosts), "regions": sorted(regions)}, indent=2))


if __name__ == "__main__":
    main()
