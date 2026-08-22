"""Reference Phase 1B AVR prototype canonicalization and identifier derivation."""

import hashlib
import json
import re
from datetime import datetime

RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:"
COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:"
ATTESTATION_MESSAGE_DOMAIN = "AIChain AVR v0.1.0-draft receipt: "
RECEIPT_FIELDS = {"schema", "schemaVersion", "assuranceLevel", "issuer", "execution", "commitments"}
COMMITMENT_FIELDS = {"configuration", "input", "model", "output", "policy", "provider"}
BYTES32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")


def validate_receipt(receipt: dict) -> None:
    """Validate the fixed Phase 1B draft shape before canonicalization."""
    if not isinstance(receipt, dict):
        raise ValueError("Receipt must be an object")
    payload = {key: value for key, value in receipt.items() if key not in ("expected", "attestation")}
    if set(payload) != RECEIPT_FIELDS:
        raise ValueError("Receipt fields do not match the AVR v0.1.0-draft shape")
    if payload["schema"] != "aichain.avr" or payload["schemaVersion"] != "0.1.0-draft":
        raise ValueError("Unsupported AVR schema or schema version")
    if not isinstance(payload["assuranceLevel"], str) or not payload["assuranceLevel"]:
        raise ValueError("assuranceLevel must be a non-empty string")
    if not isinstance(payload["issuer"], str) or not ADDRESS.fullmatch(payload["issuer"]):
        raise ValueError("issuer must be a 20-byte EVM address")
    execution = payload["execution"]
    if not isinstance(execution, dict) or set(execution) != {"claimedAt"} or not isinstance(execution["claimedAt"], str):
        raise ValueError("execution must contain only claimedAt")
    try:
        datetime.fromisoformat(execution["claimedAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("claimedAt must be an RFC 3339 timestamp") from error
    if not execution["claimedAt"].endswith("Z"):
        raise ValueError("claimedAt must be UTC and end in Z")
    commitments = payload["commitments"]
    if not isinstance(commitments, dict) or set(commitments) != COMMITMENT_FIELDS:
        raise ValueError("commitments fields do not match the AVR v0.1.0-draft shape")
    if any(not isinstance(value, str) or not BYTES32.fullmatch(value) for value in commitments.values()):
        raise ValueError("Each commitment must be a 32-byte hex value")


def canonicalize(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(domain: str, canonical_value: str) -> str:
    return "0x" + hashlib.sha256((domain + canonical_value).encode("utf-8")).hexdigest()


def derive_receipt(receipt: dict) -> dict:
    validate_receipt(receipt)
    payload = {key: value for key, value in receipt.items() if key not in ("expected", "attestation")}
    canonical_receipt = canonicalize(payload)
    canonical_commitments = canonicalize(payload["commitments"])
    return {
        "canonicalReceipt": canonical_receipt,
        "canonicalCommitments": canonical_commitments,
        "receiptId": sha256_hex(RECEIPT_DOMAIN, canonical_receipt),
        "commitmentsRoot": sha256_hex(COMMITMENTS_DOMAIN, canonical_commitments),
    }


def prepare_attestation(receipt: dict) -> dict:
    """Prepare the EIP-191 message for a prototype receipt attestation."""
    receipt_id = derive_receipt(receipt)["receiptId"]
    return {
        "schema": "aichain.avr-attestation",
        "schemaVersion": "0.1.0-draft",
        "scheme": "eip191-personal-sign",
        "receiptId": receipt_id,
        "issuer": receipt.get("issuer"),
        "message": ATTESTATION_MESSAGE_DOMAIN + receipt_id,
    }


def verify_receipt_against_anchor(receipt: dict, anchor: dict) -> dict:
    """Compare a locally derived prototype receipt against a retrieved anchor."""
    derived = derive_receipt(receipt)
    issuer_matches = (
        not anchor.get("issuer")
        or not receipt.get("issuer")
        or anchor["issuer"].lower() == receipt["issuer"].lower()
    )
    result = {
        "receiptId": derived["receiptId"],
        "commitmentsRoot": derived["commitmentsRoot"],
        "receiptIdMatches": not anchor.get("receiptId") or anchor["receiptId"].lower() == derived["receiptId"].lower(),
        "commitmentsRootMatches": anchor["commitmentsRoot"].lower() == derived["commitmentsRoot"].lower(),
        "schemaVersionMatches": anchor["schemaVersion"] == receipt["schemaVersion"],
        "issuerMatches": issuer_matches,
    }
    result["valid"] = all(
        result[key]
        for key in ("receiptIdMatches", "commitmentsRootMatches", "schemaVersionMatches", "issuerMatches")
    )
    return result


def prepare_anchor(receipt: dict) -> dict:
    """Prepare the versioned fields accepted by the prototype anchor contract."""
    derived = derive_receipt(receipt)
    return {
        "receiptId": derived["receiptId"],
        "commitmentsRoot": derived["commitmentsRoot"],
        "schemaVersion": receipt["schemaVersion"],
        "claimedIssuer": receipt.get("issuer"),
    }
