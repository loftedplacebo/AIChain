"""Check the private mainnet API binding and restart rollback."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_api_mainnet', HERE / 'configure-production-api-mainnet.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class MainnetApiTests(unittest.TestCase):
    def test_exact_configuration_is_idempotent(self):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'ENV', pathlib.Path(temporary) / 'api.env'):
            MODULE.ENV.write_bytes(b'PORT=8791\n')
            MODULE.ENV.chmod(0o600)
            original, configured = MODULE.checked_environment()
            self.assertFalse(configured)
            with mock.patch.object(MODULE.ACTIVE, 'command'), \
                    mock.patch.object(MODULE.ACTIVE, 'wait_live'):
                MODULE.install(original)
            payload, configured = MODULE.checked_environment()
            self.assertTrue(configured)
            self.assertIn(b'GOVERNANCE_EVIDENCE_RPC_URL=https://mainnet.base.org\n', payload)
            self.assertEqual(payload.count(b'GOVERNANCE_EVIDENCE_ANCHOR_JSON='), 1)

    def test_failed_restart_restores_original_environment(self):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'ENV', pathlib.Path(temporary) / 'api.env'), \
                mock.patch.object(MODULE.ACTIVE, 'command') as command, \
                mock.patch.object(MODULE.ACTIVE, 'wait_live', side_effect=[ValueError('failed'), None]):
            original = b'PORT=8791\n'
            MODULE.ENV.write_bytes(original)
            with self.assertRaisesRegex(ValueError, 'rolled back'):
                MODULE.install(original)
            self.assertEqual(MODULE.ENV.read_bytes(), original)
            self.assertEqual(command.call_count, 2)

    def test_different_existing_anchor_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'ENV', pathlib.Path(temporary) / 'api.env'):
            MODULE.ENV.write_bytes(b'PORT=8791\nGOVERNANCE_EVIDENCE_ANCHOR_JSON=other\n')
            MODULE.ENV.chmod(0o600)
            with self.assertRaisesRegex(ValueError, 'differs'):
                MODULE.checked_environment()


if __name__ == '__main__':
    unittest.main()
