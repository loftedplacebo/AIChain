import json
from pathlib import Path

from avr_presentation import assurance_summary, create_presentation, derive_presentation, validate_presentation


ROOT = Path(__file__).parents[2]
RECEIPT = json.loads((ROOT / "fixtures" / "avr" / "receipt-v0.1.0-draft.json").read_text(encoding="utf-8"))
AUTHORISED_RECEIPT = json.loads((ROOT / "fixtures" / "avr" / "authorised-receipt-v0.2.0-draft.json").read_text(encoding="utf-8"))
ANCHOR = {"mode": "batch", "chainId": 20260822, "contract": "0xE680eEb44688898c108FAf2bF8589d108Fe86fE8", "transactionHash": "0x" + "ab" * 32}


def test_commitment_only_presentation_is_canonical_and_preserves_receipt_identifiers():
    presentation = create_presentation(RECEIPT, {"level": "commitment-only"})
    assert presentation["receiptId"] == RECEIPT["expected"]["receiptId"]
    assert presentation["commitmentsRoot"] == RECEIPT["expected"]["commitmentsRoot"]
    assert derive_presentation(presentation)["presentationId"] == "0x07c328d358d4a86455ee6b27d2a91a7ef10ebf252a6f89fc2f0b29b83e0ab6d3"
    assert assurance_summary(presentation)["anchored"] is False


def test_authorised_and_zk_presentations_have_explicit_evidence():
    presentation = create_presentation(AUTHORISED_RECEIPT, {"level": "organisation-authorised"}, ANCHOR)
    assert assurance_summary(presentation)["anchorMode"] == "batch"

    proof = {"system": "risc0", "programCommitment": "0x" + "11" * 32, "publicValuesDigest": "0x" + "22" * 32, "proofDigest": "0x" + "33" * 32, "verification": "batch-claim"}
    zk_presentation = create_presentation(RECEIPT, {"level": "zk-proved", "proof": proof}, ANCHOR)
    assert assurance_summary(zk_presentation)["proofSystem"] == "risc0"


def test_rejects_substituted_identifier_and_missing_proof():
    presentation = create_presentation(RECEIPT, {"level": "commitment-only"})
    presentation["receiptId"] = "0x" + "ff" * 32
    try:
        validate_presentation(presentation)
        assert False, "Expected substituted receipt identifier to fail"
    except ValueError:
        pass
    try:
        create_presentation(RECEIPT, {"level": "zk-proved"})
        assert False, "Expected missing proof to fail"
    except ValueError:
        pass
