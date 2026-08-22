"""Reference canonicalisation for the additive authorised AVR development profile."""

import hashlib
import json
import re
from datetime import datetime

DOMAIN = "aichain:authorised-avr:0.2.0-draft:"
COMMITMENTS_DOMAIN = "aichain:authorised-avr:commitments:0.2.0-draft:"
BYTES32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
FIELDS = {"schema", "schemaVersion", "assuranceLevel", "issuer", "identity", "execution", "commitments"}
IDENTITY_FIELDS = {"organizationId", "authorityCommitment"}
COMMITMENT_FIELDS = {"configuration", "input", "model", "output", "policy", "provider"}


def canonicalize(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def validate_authorised_receipt(receipt: dict) -> None:
    if not isinstance(receipt, dict) or set(receipt) != FIELDS:
        raise ValueError("Receipt fields do not match the authorised AVR draft shape")
    if receipt["schema"] != "aichain.authorised-avr" or receipt["schemaVersion"] != "0.2.0-draft":
        raise ValueError("Unsupported authorised AVR schema")
    if receipt["assuranceLevel"] != "organisation-authorised":
        raise ValueError("assuranceLevel must be organisation-authorised")
    if not isinstance(receipt["issuer"], str) or not ADDRESS.fullmatch(receipt["issuer"]):
        raise ValueError("issuer must be an EVM address")
    identity = receipt["identity"]
    if not isinstance(identity, dict) or set(identity) != IDENTITY_FIELDS or any(
        not isinstance(value, str) or not BYTES32.fullmatch(value) for value in identity.values()
    ):
        raise ValueError("identity must contain bytes32 organizationId and authorityCommitment")
    execution = receipt["execution"]
    if not isinstance(execution, dict) or set(execution) != {"claimedAt"} or not isinstance(execution["claimedAt"], str):
        raise ValueError("execution.claimedAt must be an RFC 3339 UTC timestamp")
    try:
        datetime.fromisoformat(execution["claimedAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("execution.claimedAt must be an RFC 3339 UTC timestamp") from error
    if not execution["claimedAt"].endswith("Z"):
        raise ValueError("execution.claimedAt must be UTC")
    commitments = receipt["commitments"]
    if not isinstance(commitments, dict) or set(commitments) != COMMITMENT_FIELDS or any(
        not isinstance(value, str) or not BYTES32.fullmatch(value) for value in commitments.values()
    ):
        raise ValueError("commitments must contain six bytes32 values")


def derive_authorised_receipt(receipt: dict) -> dict:
    validate_authorised_receipt(receipt)
    canonical_receipt = canonicalize(receipt)
    canonical_commitments = canonicalize(receipt["commitments"])
    return {
        "canonicalReceipt": canonical_receipt,
        "canonicalCommitments": canonical_commitments,
        "receiptId": "0x" + hashlib.sha256((DOMAIN + canonical_receipt).encode("utf-8")).hexdigest(),
        "commitmentsRoot": "0x" + hashlib.sha256((COMMITMENTS_DOMAIN + canonical_commitments).encode("utf-8")).hexdigest(),
    }


def prepare_authorised_anchor(receipt: dict) -> dict:
    derived = derive_authorised_receipt(receipt)
    return {
        **derived,
        "organizationId": receipt["identity"]["organizationId"],
        "authorityCommitment": receipt["identity"]["authorityCommitment"],
        "schemaVersion": receipt["schemaVersion"],
        "issuer": receipt["issuer"],
    }

