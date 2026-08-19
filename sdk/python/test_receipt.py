import json
from pathlib import Path
from receipt import derive_receipt


FIXTURE = Path(__file__).parents[2] / "fixtures" / "avr" / "receipt-v0.1.0-draft.json"


def test_fixture_identifiers():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    derived = derive_receipt(fixture)
    assert derived["receiptId"] == fixture["expected"]["receiptId"]
    assert derived["commitmentsRoot"] == fixture["expected"]["commitmentsRoot"]


def test_changed_commitment_changes_identifiers():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    changed = json.loads(json.dumps(fixture))
    changed["commitments"]["input"] = "0x" + "aa" * 32
    assert derive_receipt(changed)["receiptId"] != derive_receipt(fixture)["receiptId"]
    assert derive_receipt(changed)["commitmentsRoot"] != derive_receipt(fixture)["commitmentsRoot"]
