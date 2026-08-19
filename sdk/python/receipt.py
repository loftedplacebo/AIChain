"""Reference Phase 1B AVR prototype canonicalization and identifier derivation."""

import hashlib
import json

RECEIPT_DOMAIN = "aichain:avr:0.1.0-draft:"
COMMITMENTS_DOMAIN = "aichain:avr:commitments:0.1.0-draft:"


def canonicalize(value: object) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def sha256_hex(domain: str, canonical_value: str) -> str:
    return "0x" + hashlib.sha256((domain + canonical_value).encode("utf-8")).hexdigest()


def derive_receipt(receipt: dict) -> dict:
    payload = {key: value for key, value in receipt.items() if key != "expected"}
    canonical_receipt = canonicalize(payload)
    canonical_commitments = canonicalize(payload["commitments"])
    return {
        "canonicalReceipt": canonical_receipt,
        "canonicalCommitments": canonical_commitments,
        "receiptId": sha256_hex(RECEIPT_DOMAIN, canonical_receipt),
        "commitmentsRoot": sha256_hex(COMMITMENTS_DOMAIN, canonical_commitments),
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
