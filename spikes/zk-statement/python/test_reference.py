import copy
import json
import unittest
from pathlib import Path

from reference import derive_public, evaluate, verify


FIXTURE = Path(__file__).parents[3] / "fixtures" / "zk" / "policy-evaluation-v0.1.0-draft.json"


class PolicyStatementTests(unittest.TestCase):
    def setUp(self):
        self.document = json.loads(FIXTURE.read_text(encoding="utf-8"))

    def test_golden_vector(self):
        self.assertTrue(verify(self.document))
        self.assertEqual(
            derive_public(self.document["publicMetadata"], self.document["privateWitness"]),
            self.document["expectedPublic"],
        )

    def test_private_action_tamper_changes_public_bindings(self):
        tampered = copy.deepcopy(self.document)
        tampered["privateWitness"]["action"]["amount"] = 1001
        self.assertFalse(verify(tampered))
        self.assertEqual(evaluate(tampered["privateWitness"])["decision"], "deny")

    def test_private_policy_tamper_changes_public_bindings(self):
        tampered = copy.deepcopy(self.document)
        tampered["privateWitness"]["policy"]["maxAmount"] = 500
        self.assertFalse(verify(tampered))

    def test_public_substitution_is_rejected(self):
        for field in ("receiptId", "commitmentsRoot", "resultCommitment", "programCommitment"):
            with self.subTest(field=field):
                tampered = copy.deepcopy(self.document)
                tampered["expectedPublic"][field] = "0x" + "ff" * 32
                self.assertFalse(verify(tampered))

    def test_unsorted_or_duplicate_allowlist_is_rejected(self):
        for values in (["transfer", "approve"], ["transfer", "transfer"]):
            with self.subTest(values=values):
                tampered = copy.deepcopy(self.document)
                tampered["privateWitness"]["policy"]["allowedOperations"] = values
                with self.assertRaises(ValueError):
                    verify(tampered)


if __name__ == "__main__":
    unittest.main()
