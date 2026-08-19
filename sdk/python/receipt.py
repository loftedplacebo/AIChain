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
