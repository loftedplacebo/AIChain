"""Deterministic reference for AIChain ZK policy statement v0.1.0-draft."""

from __future__ import annotations

import copy
import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

STATEMENT_VERSION = "0.1.0-draft"
RECEIPT_VERSION = "0.2.0-draft"
RULE_SET = "aichain.policy.allowlist-v1"
STATEMENT_ID = hashlib.sha256(
    b"aichain:zk-statement:policy-evaluation:0.1.0-draft"
).hexdigest()
PROGRAM_COMMITMENT = hashlib.sha256(
    b"aichain:zk-program:policy-evaluation:allowlist-v1"
).hexdigest()
BYTES32 = re.compile(r"^0x[0-9a-f]{64}$")


def canonicalize(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def sha256_hex(value: bytes) -> str:
    return "0x" + hashlib.sha256(value).hexdigest()


def blinded_commitment(kind: str, value: object, blinding: str) -> str:
    if not BYTES32.fullmatch(blinding):
        raise ValueError(f"{kind} blinding must be a lowercase bytes32")
    domain = f"aichain:zk-witness:{STATEMENT_VERSION}:{kind}:".encode()
    return sha256_hex(domain + bytes.fromhex(blinding[2:]) + canonicalize(value))


def _exact_keys(value: dict, keys: set[str], label: str) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError(f"{label} must contain exactly {sorted(keys)}")


def validate_witness(witness: dict) -> None:
    _exact_keys(witness, {"action", "configuration", "policy", "blindings", "modelCommitment", "providerCommitment"}, "witness")
    action = witness["action"]
    config = witness["configuration"]
    policy = witness["policy"]
    blindings = witness["blindings"]
    _exact_keys(action, {"operation", "resource", "amount"}, "action")
    _exact_keys(config, {"enforceAmount", "enforceResource"}, "configuration")
    _exact_keys(policy, {"allowedOperations", "allowedResources", "maxAmount"}, "policy")
    _exact_keys(blindings, {"input", "output", "configuration", "policy"}, "blindings")
    if not isinstance(action["operation"], str) or not action["operation"]:
        raise ValueError("operation must be a non-empty string")
    if not isinstance(action["resource"], str) or not action["resource"]:
        raise ValueError("resource must be a non-empty string")
    for label, value in (("amount", action["amount"]), ("maxAmount", policy["maxAmount"])):
        if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value >= 2**63:
            raise ValueError(f"{label} must be an unsigned 63-bit integer")
    if not all(isinstance(config[key], bool) for key in config):
        raise ValueError("configuration flags must be booleans")
    for key in ("allowedOperations", "allowedResources"):
        values = policy[key]
        if not isinstance(values, list) or not all(isinstance(v, str) and v for v in values):
            raise ValueError(f"{key} must contain non-empty strings")
        if values != sorted(set(values)):
            raise ValueError(f"{key} must be sorted and unique")
    for key, value in blindings.items():
        if not BYTES32.fullmatch(value):
            raise ValueError(f"{key} blinding must be a lowercase bytes32")
    for key in ("modelCommitment", "providerCommitment"):
        if not BYTES32.fullmatch(witness[key]):
            raise ValueError(f"{key} must be a lowercase bytes32")


def evaluate(witness: dict) -> dict:
    validate_witness(witness)
    action, config, policy = witness["action"], witness["configuration"], witness["policy"]
    reasons: list[str] = []
    if action["operation"] not in policy["allowedOperations"]:
        reasons.append("operation-not-allowed")
    if config["enforceResource"] and action["resource"] not in policy["allowedResources"]:
        reasons.append("resource-not-allowed")
    if config["enforceAmount"] and action["amount"] > policy["maxAmount"]:
        reasons.append("amount-exceeds-limit")
    return {"decision": "deny" if reasons else "allow", "reasonCodes": reasons, "ruleSet": RULE_SET}


def _claimed_at(epoch_seconds: int) -> str:
    if isinstance(epoch_seconds, bool) or not isinstance(epoch_seconds, int) or epoch_seconds < 0:
        raise ValueError("claimedAtEpochSeconds must be a non-negative integer")
    return datetime.fromtimestamp(epoch_seconds, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def derive_public(metadata: dict, witness: dict) -> dict:
    _exact_keys(metadata, {"issuer", "organizationId", "authorityCommitment", "claimedAtEpochSeconds"}, "metadata")
    validate_witness(witness)
    issuer = metadata["issuer"].lower()
    for key in ("organizationId", "authorityCommitment"):
        if not BYTES32.fullmatch(metadata[key]):
            raise ValueError(f"{key} must be a lowercase bytes32")
    result = evaluate(witness)
    commitments = {
        "configuration": blinded_commitment("configuration", witness["configuration"], witness["blindings"]["configuration"]),
        "input": blinded_commitment("input", witness["action"], witness["blindings"]["input"]),
        "model": witness["modelCommitment"],
        "output": blinded_commitment("output", result, witness["blindings"]["output"]),
        "policy": blinded_commitment("policy", witness["policy"], witness["blindings"]["policy"]),
        "provider": witness["providerCommitment"],
    }
    commitments_root = sha256_hex(
        f"aichain:authorised-avr:commitments:{RECEIPT_VERSION}:".encode() + canonicalize(commitments)
    )
    receipt = {
        "assuranceLevel": "organisation-authorised",
        "commitments": commitments,
        "execution": {"claimedAt": _claimed_at(metadata["claimedAtEpochSeconds"])},
        "identity": {"authorityCommitment": metadata["authorityCommitment"], "organizationId": metadata["organizationId"]},
        "issuer": issuer,
        "schema": "aichain.authorised-avr",
        "schemaVersion": RECEIPT_VERSION,
    }
    receipt_id = sha256_hex(
        f"aichain:authorised-avr:{RECEIPT_VERSION}:".encode() + canonicalize(receipt)
    )
    return {
        "authorityCommitment": metadata["authorityCommitment"],
        "claimedAtEpochSeconds": metadata["claimedAtEpochSeconds"],
        "commitmentsRoot": commitments_root,
        "decision": result["decision"],
        "issuer": issuer,
        "organizationId": metadata["organizationId"],
        "programCommitment": "0x" + PROGRAM_COMMITMENT,
        "receiptId": receipt_id,
        "resultCommitment": commitments["output"],
        "statementId": "0x" + STATEMENT_ID,
    }


def verify(document: dict) -> bool:
    return derive_public(document["publicMetadata"], document["privateWitness"]) == document["expectedPublic"]


def main() -> None:
    document = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    print(json.dumps(derive_public(document["publicMetadata"], document["privateWitness"]), indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
