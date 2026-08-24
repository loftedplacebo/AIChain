#!/usr/bin/env python3
"""Assert G2 malformed, invalid, stale/unknown and duplicate rejection paths."""

import argparse
import json
import urllib.request
from pathlib import Path


def call(url, method, params):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        result = json.load(response)
    if result.get("error"):
        raise RuntimeError(result["error"])
    return result["result"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_log", type=Path)
    parser.add_argument("--node-rpc", default="http://127.0.0.1:8545")
    args = parser.parse_args()
    entries = [json.loads(line) for line in args.audit_log.read_text(encoding="utf-8").splitlines() if line]
    accepted = next((entry for entry in reversed(entries) if entry.get("accepted")), None)
    if accepted is None:
        raise SystemExit("audit log contains no accepted GPU solution")

    current = call(args.node_rpc, "aichain_getKawpowWork", [])
    malformed = call(args.node_rpc, "aichain_submitKawpowWork", [{"version": "bad"}])
    invalid = call(args.node_rpc, "aichain_submitKawpowWork", [{
        "version": current["version"], "workId": current["workId"],
        "nonce": "0x0000000000000000", "mixDigest": "0x" + "00" * 32,
    }])
    stale = call(args.node_rpc, "aichain_submitKawpowWork", [{
        "version": current["version"], "workId": "0x" + "00" * 32,
        "nonce": "0x0000000000000000", "mixDigest": "0x" + "00" * 32,
    }])
    duplicate = next((entry for entry in entries if entry.get("workId") == accepted["workId"]
                      and entry.get("status") == "duplicate"), None)
    if duplicate is None:
        raise SystemExit("audit log contains no node-returned duplicate rejection for accepted work")
    observed = {"malformed": malformed, "invalid": invalid, "stale": stale,
                "duplicate": duplicate, "gpuAccepted": accepted}
    expected = {"malformed": "malformed", "invalid": "invalid-seal", "stale": "stale",
                "duplicate": "duplicate"}
    for name, status in expected.items():
        if observed[name].get("accepted") or observed[name].get("status") != status:
            raise SystemExit(f"unexpected {name} result: {observed[name]}")
    print(json.dumps(observed, indent=2))


if __name__ == "__main__":
    main()
