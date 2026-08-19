import json
from pathlib import Path
from receipt import derive_receipt, prepare_anchor, verify_receipt_against_anchor


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


def test_verifies_matching_anchor_and_rejects_changed_receipt():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    anchor = {
        "receiptId": fixture["expected"]["receiptId"],
        "commitmentsRoot": fixture["expected"]["commitmentsRoot"],
        "schemaVersion": fixture["schemaVersion"],
        "issuer": fixture["issuer"],
    }
    assert verify_receipt_against_anchor(fixture, anchor)["valid"] is True

    changed = json.loads(json.dumps(fixture))
    changed["commitments"]["policy"] = "0x" + "bb" * 32
    assert verify_receipt_against_anchor(changed, anchor)["valid"] is False


def test_prepares_contract_anchor_fields():
    fixture = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert prepare_anchor(fixture) == {
        "receiptId": fixture["expected"]["receiptId"],
        "commitmentsRoot": fixture["expected"]["commitmentsRoot"],
        "schemaVersion": fixture["schemaVersion"],
        "claimedIssuer": fixture["issuer"],
    }
