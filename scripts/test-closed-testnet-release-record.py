#!/usr/bin/env python3
"""Regression checks for the closed-testnet release-record gate."""

from __future__ import annotations

import hashlib
import json
import subprocess
import sys
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
VALIDATOR = ROOT / "scripts" / "validate-closed-testnet-release-record.py"


def digest(char: str) -> str:
    return "0x" + char * 64


def manifest() -> str:
    return "\n".join((
        "AICHAIN_TESTNET_NAME=phase4-testnet", "AICHAIN_CHAIN_ID=2026091301", "AICHAIN_NETWORK_ID=2026091301",
        f"AICHAIN_GENESIS_SHA256={digest('a')}", "AICHAIN_CONSENSUS_PROFILE=kawpow-candidate",
        "AICHAIN_MINER_OPERATORS=miner-a,miner-b,miner-c", "AICHAIN_VALIDATOR_OPERATORS=validator-a,validator-b",
        "AICHAIN_REGIONS=region-a,region-b", "AICHAIN_PUBLIC_RPC=false", "AICHAIN_RPC_BINDING=private",
        "AICHAIN_P2P_ALLOWLIST=true", "AICHAIN_MONITORING=required", "AICHAIN_RESET_RUNBOOK_VERSION=0-1-0-draft", "",
    ))


def record(manifest_bytes: bytes) -> dict[str, object]:
    return {
        "schema": "aichain.closed-testnet-release-record", "schemaVersion": "0.1.0-draft", "epoch": "phase4-epoch-1",
        "manifestSha256": "0x" + hashlib.sha256(manifest_bytes).hexdigest(),
        "genesis": {"chainId": 2026091301, "networkId": 2026091301, "sha256": digest("a")},
        "source": {"coreGethCommit": "1" * 40, "coreGethBinarySha256": digest("b"), "kawpowAdapterCommit": "2" * 40,
                   "kawpowMinerSha256": digest("c"), "consensusProfile": "kawpow-candidate"},
        "contractArtifacts": [{"id": "avr-anchor", "sha256": digest("d"), "schemaVersion": "0-4-0-alpha"}],
        "roles": [
            {"operator": "miner-a", "role": "miner", "region": "region-a"}, {"operator": "miner-b", "role": "miner", "region": "region-a"},
            {"operator": "miner-c", "role": "miner", "region": "region-b"}, {"operator": "validator-a", "role": "validator", "region": "region-a"},
            {"operator": "validator-b", "role": "validator", "region": "region-b"}, {"operator": "ingress-a", "role": "ingress", "region": "region-a"},
            {"operator": "monitor-a", "role": "monitoring", "region": "region-b"},
        ],
        "runbooks": {"reset": "0-1-0-draft", "upgrade": "0-1-0-draft", "incident": "0-1-0-draft", "monitoring": "0-1-0-draft"},
        "approvals": ["release-a", "release-b"],
    }


def validate(manifest_path: Path, record_path: Path, should_pass: bool) -> None:
    result = subprocess.run([sys.executable, str(VALIDATOR), "--manifest", str(manifest_path), "--record", str(record_path)], capture_output=True, text=True)
    assert (result.returncode == 0) == should_pass, result.stderr


def main() -> None:
    with tempfile.TemporaryDirectory() as raw:
        directory = Path(raw)
        manifest_path, record_path = directory / "manifest.env", directory / "record.json"
        manifest_path.write_text(manifest(), encoding="utf-8")
        good = record(manifest_path.read_bytes())
        record_path.write_text(json.dumps(good), encoding="utf-8")
        validate(manifest_path, record_path, True)
        bad_hash = {**good, "manifestSha256": digest("e")}
        record_path.write_text(json.dumps(bad_hash), encoding="utf-8")
        validate(manifest_path, record_path, False)
        bad_roles = record(manifest_path.read_bytes())
        bad_roles["roles"] = [role for role in bad_roles["roles"] if role["operator"] != "miner-c"]
        record_path.write_text(json.dumps(bad_roles), encoding="utf-8")
        validate(manifest_path, record_path, False)
    print("Closed-testnet release-record regression checks passed.")


if __name__ == "__main__":
    main()
