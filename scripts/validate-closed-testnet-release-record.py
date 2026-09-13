#!/usr/bin/env python3
"""Validate a non-secret closed-testnet release record without provisioning anything."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path
from typing import Any


HEX_32 = re.compile(r"^0x[0-9a-f]{64}$")
GIT_COMMIT = re.compile(r"^[0-9a-f]{40}$")
TOKEN = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")
RECORD_KEYS = {"schema", "schemaVersion", "epoch", "manifestSha256", "genesis", "source", "contractArtifacts", "roles", "runbooks", "approvals"}


def fail(message: str) -> None:
    raise SystemExit(f"Invalid closed-testnet release record: {message}")


def read_env(path: Path) -> dict[str, str]:
    allowed = {
        "AICHAIN_TESTNET_NAME", "AICHAIN_CHAIN_ID", "AICHAIN_NETWORK_ID", "AICHAIN_GENESIS_SHA256",
        "AICHAIN_CONSENSUS_PROFILE", "AICHAIN_MINER_OPERATORS", "AICHAIN_VALIDATOR_OPERATORS",
        "AICHAIN_REGIONS", "AICHAIN_PUBLIC_RPC", "AICHAIN_RPC_BINDING", "AICHAIN_P2P_ALLOWLIST",
        "AICHAIN_MONITORING", "AICHAIN_RESET_RUNBOOK_VERSION",
    }
    values: dict[str, str] = {}
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            fail("manifest contains a malformed line")
        key, value = line.split("=", 1)
        if key not in allowed or key in values:
            fail("manifest contains unsupported or duplicate fields")
        values[key] = value
    if values.keys() != allowed:
        fail("manifest is incomplete")
    return values


def require_token(value: Any, field: str) -> str:
    if not isinstance(value, str) or not TOKEN.fullmatch(value):
        fail(f"{field} must be a lower-case token")
    return value


def require_digest(value: Any, field: str) -> str:
    if not isinstance(value, str) or not HEX_32.fullmatch(value):
        fail(f"{field} must be a 32-byte lower-case digest")
    return value


def unique_tokens(value: Any, field: str, minimum: int = 1) -> list[str]:
    if not isinstance(value, list) or len(value) < minimum:
        fail(f"{field} must have at least {minimum} entries")
    result = [require_token(item, field) for item in value]
    if len(set(result)) != len(result):
        fail(f"{field} entries must be unique")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--record", type=Path, required=True)
    args = parser.parse_args()
    manifest = read_env(args.manifest)
    try:
        record = json.loads(args.record.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        fail(str(error))
    if not isinstance(record, dict) or set(record) != RECORD_KEYS:
        fail("top-level fields must exactly match the release-record schema")
    if record["schema"] != "aichain.closed-testnet-release-record" or record["schemaVersion"] != "0.1.0-draft":
        fail("unsupported schema/version")
    require_token(record["epoch"], "epoch")
    manifest_hash = "0x" + hashlib.sha256(args.manifest.read_bytes()).hexdigest()
    if record["manifestSha256"] != manifest_hash:
        fail("manifest digest does not match")

    genesis = record["genesis"]
    if not isinstance(genesis, dict) or set(genesis) != {"chainId", "networkId", "sha256"}:
        fail("genesis fields must be chainId, networkId and sha256")
    if genesis["chainId"] != int(manifest["AICHAIN_CHAIN_ID"]) or genesis["networkId"] != int(manifest["AICHAIN_NETWORK_ID"]):
        fail("genesis chain/network IDs do not match manifest")
    if genesis["sha256"] != manifest["AICHAIN_GENESIS_SHA256"].lower():
        fail("genesis digest does not match manifest")

    source = record["source"]
    required_source = {"coreGethCommit", "coreGethBinarySha256", "kawpowAdapterCommit", "kawpowMinerSha256", "consensusProfile"}
    if not isinstance(source, dict) or set(source) != required_source:
        fail("source fields are incomplete")
    for field in ("coreGethCommit", "kawpowAdapterCommit"):
        if not isinstance(source[field], str) or not GIT_COMMIT.fullmatch(source[field]):
            fail(f"source.{field} must be a 40-character lower-case Git commit")
    for field in ("coreGethBinarySha256", "kawpowMinerSha256"):
        require_digest(source[field], f"source.{field}")
    if source["consensusProfile"] != manifest["AICHAIN_CONSENSUS_PROFILE"]:
        fail("consensus profile does not match manifest")

    artifacts = record["contractArtifacts"]
    if not isinstance(artifacts, list) or not artifacts:
        fail("contractArtifacts must be a non-empty list")
    artifact_ids: set[str] = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict) or set(artifact) != {"id", "sha256", "schemaVersion"}:
            fail("each contract artifact must have id, sha256 and schemaVersion")
        identifier = require_token(artifact["id"], "contract artifact id")
        if identifier in artifact_ids:
            fail("contract artifact IDs must be unique")
        artifact_ids.add(identifier)
        require_digest(artifact["sha256"], "contract artifact sha256")
        require_token(artifact["schemaVersion"], "contract artifact schemaVersion")

    roles = record["roles"]
    if not isinstance(roles, list) or not roles:
        fail("roles must be a non-empty list")
    role_operators: dict[str, set[str]] = {"miner": set(), "validator": set(), "ingress": set(), "monitoring": set()}
    regions: set[str] = set()
    for role in roles:
        if not isinstance(role, dict) or set(role) != {"operator", "role", "region"}:
            fail("each role must have operator, role and region only")
        operator = require_token(role["operator"], "role operator")
        kind = role["role"]
        if kind not in role_operators:
            fail("role must be miner, validator, ingress or monitoring")
        if operator in role_operators[kind]:
            fail("operator may appear only once in each role")
        role_operators[kind].add(operator)
        regions.add(require_token(role["region"], "role region"))
    manifest_miners = set(manifest["AICHAIN_MINER_OPERATORS"].split(","))
    manifest_validators = set(manifest["AICHAIN_VALIDATOR_OPERATORS"].split(","))
    if role_operators["miner"] != manifest_miners or role_operators["validator"] != manifest_validators:
        fail("miner/validator role inventory does not exactly match manifest")
    if role_operators["miner"] & role_operators["validator"]:
        fail("miner and validator operators must not overlap")
    if not role_operators["ingress"] or not role_operators["monitoring"] or len(regions) < 2:
        fail("ingress, monitoring and two regions are required")

    runbooks = record["runbooks"]
    if not isinstance(runbooks, dict) or set(runbooks) != {"reset", "upgrade", "incident", "monitoring"}:
        fail("runbooks must identify reset, upgrade, incident and monitoring versions")
    for field, value in runbooks.items():
        require_token(value, f"runbooks.{field}")
    if runbooks["reset"] != manifest["AICHAIN_RESET_RUNBOOK_VERSION"]:
        fail("reset runbook does not match manifest")
    unique_tokens(record["approvals"], "approvals", minimum=2)
    print(json.dumps({"status": "valid", "epoch": record["epoch"], "roles": len(roles), "artifacts": len(artifacts)}, indent=2))


if __name__ == "__main__":
    main()
