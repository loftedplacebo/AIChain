"""Offline checks for the one-time production migration credential."""

import base64
import hashlib
import hmac
import importlib.util
import pathlib
import unittest
from unittest.mock import patch


MODULE = pathlib.Path(__file__).with_name('apply-production-schema.py')
spec = importlib.util.spec_from_file_location('production_schema', MODULE)
schema = importlib.util.module_from_spec(spec)
spec.loader.exec_module(schema)


class ScramVerifierTest(unittest.TestCase):
    def test_matches_independent_scram_derivation(self):
        salt = bytes(range(16))
        with patch.object(schema.secrets, 'token_bytes', return_value=salt):
            verifier = schema.scram_verifier('example-password')
        mechanism, iterations_and_salt, keys = verifier.split('$')
        iterations, encoded_salt = iterations_and_salt.split(':')
        stored, server = (base64.b64decode(part) for part in keys.split(':'))
        self.assertEqual(mechanism, 'SCRAM-SHA-256')
        self.assertEqual(iterations, '4096')
        self.assertEqual(base64.b64decode(encoded_salt), salt)
        salted = hashlib.pbkdf2_hmac('sha256', b'example-password', salt, 4096)
        self.assertEqual(stored, hashlib.sha256(hmac.new(salted, b'Client Key',
                                                        hashlib.sha256).digest()).digest())
        self.assertEqual(server, hmac.new(salted, b'Server Key', hashlib.sha256).digest())
        self.assertNotIn('example-password', verifier)


if __name__ == '__main__':
    unittest.main()
