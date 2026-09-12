"""Phase 2D alpha application presentation for existing AVR receipts.

This additive layer leaves legacy receipt identifiers and anchor contracts
unchanged. It presents their evidence in a single canonical, portable shape.
"""

import hashlib
import re

from authorised_receipt import derive_authorised_receipt
from receipt import canonicalize, derive_receipt
from verification_receipt import SCHEMA as GENERAL_SCHEMA, derive_verification_receipt

DOMAIN = "aichain:avr-presentation:0.3.0-alpha:"
BYTES32 = re.compile(r"^0x[0-9a-fA-F]{64}$")
ADDRESS = re.compile(r"^0x[0-9a-fA-F]{40}$")
ASSURANCE_LEVELS = {"commitment-only", "issuer-attested", "organisation-authorised", "zk-proved"}


def _exact_keys(value: object, expected: set) -> bool:
    return isinstance(value, dict) and set(value) == expected


def _derive_underlying_receipt(receipt: dict) -> dict:
    if receipt.get("schema") == "aichain.avr":
        return derive_receipt(receipt)
    if receipt.get("schema") == "aichain.authorised-avr":
        return derive_authorised_receipt(receipt)
    if receipt.get("schema") == GENERAL_SCHEMA:
        return derive_verification_receipt(receipt)
    raise ValueError("Unsupported AVR receipt schema")


def _validate_anchor(anchor: dict) -> None:
    if not isinstance(anchor, dict) or not {"mode", "chainId", "contract", "transactionHash"}.issubset(anchor) or not set(anchor).issubset({"mode", "chainId", "contract", "transactionHash", "batch"}):
        raise ValueError("anchor must contain mode, chainId, contract, and transactionHash")
    if anchor["mode"] not in {"individual", "batch"}:
        raise ValueError("anchor.mode must be individual or batch")
    if not isinstance(anchor["chainId"], int) or anchor["chainId"] < 0:
        raise ValueError("anchor.chainId must be a non-negative integer")
    if not isinstance(anchor["contract"], str) or not ADDRESS.fullmatch(anchor["contract"]):
        raise ValueError("anchor.contract must be an EVM address")
    if not isinstance(anchor["transactionHash"], str) or not BYTES32.fullmatch(anchor["transactionHash"]):
        raise ValueError("anchor.transactionHash must be a bytes32 transaction hash")
    if anchor["mode"] != "batch" and "batch" in anchor:
        raise ValueError("anchor.batch is only valid for batch mode")


def _validate_proof(proof: dict) -> None:
    if not _exact_keys(proof, {"system", "programCommitment", "publicValuesDigest", "proofDigest", "verification"}):
        raise ValueError("proof must contain system, programCommitment, publicValuesDigest, proofDigest, and verification")
    if proof["system"] != "risc0":
        raise ValueError("Only the selected alpha proof system, risc0, is supported")
    if any(not isinstance(proof[key], str) or not BYTES32.fullmatch(proof[key]) for key in ("programCommitment", "publicValuesDigest", "proofDigest")):
        raise ValueError("proof commitments must be bytes32 values")
    if proof["verification"] not in {"individually-verified", "batch-claim"}:
        raise ValueError("proof.verification must be individually-verified or batch-claim")


def _validate_assurance(assurance: dict, receipt: dict) -> None:
    if not isinstance(assurance, dict) or not set(assurance).issubset({"level", "attestation", "proof"}):
        raise ValueError("assurance contains unsupported fields")
    if assurance.get("level") not in ASSURANCE_LEVELS:
        raise ValueError("Unsupported assurance level")
    if receipt.get('schema') == GENERAL_SCHEMA and assurance['level'] not in ('commitment-only', 'issuer-attested'):
        raise ValueError('General receipts require a separately specified authority/proof adapter; current alpha supports commitment-only and issuer-attested')
    if assurance["level"] == "issuer-attested":
        attestation = assurance.get("attestation")
        if not _exact_keys(attestation, {"scheme", "signer", "signature"}) or attestation["scheme"] != "eip191-personal-sign" or not isinstance(attestation["signer"], str) or not ADDRESS.fullmatch(attestation["signer"]) or not isinstance(attestation["signature"], str) or not re.fullmatch(r"0x[0-9a-fA-F]{130}", attestation["signature"]):
            raise ValueError("Invalid issuer attestation")
    elif "attestation" in assurance:
        raise ValueError("attestation is only valid for issuer-attested presentations")
    if assurance["level"] == "organisation-authorised" and receipt.get("schema") != "aichain.authorised-avr":
        raise ValueError("organisation-authorised assurance requires an authorised AVR receipt")
    if assurance["level"] == "zk-proved":
        _validate_proof(assurance.get("proof"))
    elif "proof" in assurance:
        raise ValueError("proof is only valid for zk-proved presentations")


def validate_presentation(presentation: dict) -> None:
    if not _exact_keys(presentation, {"schema", "schemaVersion", "receipt", "receiptId", "commitmentsRoot", "assurance", "anchor"}):
        raise ValueError("Presentation fields do not match the AVR alpha shape")
    if presentation["schema"] != "aichain.avr-presentation" or presentation["schemaVersion"] != "0.3.0-alpha":
        raise ValueError("Unsupported AVR presentation schema")
    derived = _derive_underlying_receipt(presentation["receipt"])
    if presentation["receiptId"] != derived["receiptId"] or presentation["commitmentsRoot"] != derived["commitmentsRoot"]:
        raise ValueError("Presentation receipt identifiers do not match the embedded receipt")
    _validate_assurance(presentation["assurance"], presentation["receipt"])
    if presentation["anchor"] is not None:
        _validate_anchor(presentation["anchor"])
        if presentation['receipt']['schema'] == GENERAL_SCHEMA:
            anchor, context = presentation['anchor'], presentation['receipt']['context']
            if type(anchor['chainId']) is not int or anchor['chainId'] > 2**53 - 1 or str(anchor['chainId']) != context['chainId'] or anchor['contract'].lower() != context['anchorContract']:
                raise ValueError('Anchor location does not match signed receipt context')


def create_presentation(receipt: dict, assurance: dict, anchor: dict | None = None) -> dict:
    derived = _derive_underlying_receipt(receipt)
    presentation = {"schema": "aichain.avr-presentation", "schemaVersion": "0.3.0-alpha", "receipt": receipt, "receiptId": derived["receiptId"], "commitmentsRoot": derived["commitmentsRoot"], "assurance": assurance, "anchor": anchor}
    validate_presentation(presentation)
    return presentation


def derive_presentation(presentation: dict) -> dict:
    validate_presentation(presentation)
    canonical_presentation = canonicalize(presentation)
    return {"canonicalPresentation": canonical_presentation, "presentationId": "0x" + hashlib.sha256((DOMAIN + canonical_presentation).encode("utf-8")).hexdigest(), "receiptId": presentation["receiptId"], "commitmentsRoot": presentation["commitmentsRoot"], "assuranceLevel": presentation["assurance"]["level"]}


def assurance_summary(presentation: dict) -> dict:
    derived = derive_presentation(presentation)
    result = {"receiptId": derived["receiptId"], "presentationId": derived["presentationId"], "assuranceLevel": derived["assuranceLevel"], "anchored": presentation["anchor"] is not None, "anchorMode": presentation["anchor"]["mode"] if presentation["anchor"] else None, "proofSystem": presentation["assurance"].get("proof", {}).get("system"), "proofVerification": presentation["assurance"].get("proof", {}).get("verification"), "scope": "Evidence binds committed AVR data; it does not establish model-output truth."}
    if presentation['receipt']['schema'] == GENERAL_SCHEMA:
        result.update(profile=presentation['receipt']['profile'], profileValidation='not-checked', signatureVerification='not-checked', scope='Commits evidence and claimed event metadata; does not establish physical truth, safety, authority, or evidence availability.')
    return result
