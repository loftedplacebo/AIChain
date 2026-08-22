import json
from pathlib import Path

from authorised_receipt import derive_authorised_receipt, prepare_authorised_anchor


FIXTURE = Path(__file__).parents[2] / "fixtures" / "avr" / "authorised-receipt-v0.2.0-draft.json"


def test_python_derivation_matches_authorised_fixture_shape():
    receipt = json.loads(FIXTURE.read_text(encoding="utf-8"))
    anchor = prepare_authorised_anchor(receipt)
    assert anchor["receiptId"] == derive_authorised_receipt(receipt)["receiptId"]
    assert anchor["organizationId"] == receipt["identity"]["organizationId"]
    assert anchor["authorityCommitment"] == receipt["identity"]["authorityCommitment"]

