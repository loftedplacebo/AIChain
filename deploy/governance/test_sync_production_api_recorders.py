"""Synthetic Production recorder sync checks; no live API restart."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_api_recorders', HERE / 'sync-production-api-recorders.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
ROWS = [{'tenant': 'org-' + '1' * 36, 'project': 'prj-' + '2' * 36,
         'recorder': '0x' + 'ab' * 20}]


class RecorderSyncTests(unittest.TestCase):
    def test_install_adds_only_public_project_binding(self):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'ENV', pathlib.Path(temporary) / 'api.env'), \
                mock.patch.object(MODULE.ACTIVE, 'command') as command, \
                mock.patch.object(MODULE, 'wait_live'):
            original = b'PORT=8791\n'
            MODULE.ENV.write_bytes(original)
            MODULE.ENV.chmod(0o600)
            MODULE.install(original, None, ROWS)
            content, fields = MODULE.protected_environment()
            self.assertIn(b'GOVERNANCE_PRODUCTION_RECORDER_MAP=', content)
            self.assertIn(ROWS[0]['recorder'], fields[MODULE.FIELD])
            self.assertEqual(command.call_count, 1)

    def test_restart_failure_restores_original_file(self):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'ENV', pathlib.Path(temporary) / 'api.env'), \
                mock.patch.object(MODULE.ACTIVE, 'command') as command, \
                mock.patch.object(MODULE, 'wait_live', side_effect=[ValueError('failed'), None]):
            original = b'PORT=8791\n'
            MODULE.ENV.write_bytes(original)
            MODULE.ENV.chmod(0o600)
            with self.assertRaisesRegex(ValueError, 'rolled back'):
                MODULE.install(original, None, ROWS)
            self.assertEqual(MODULE.ENV.read_bytes(), original)
            self.assertEqual(command.call_count, 2)

    def test_first_cohort_limit(self):
        with self.assertRaisesRegex(ValueError, 'ten projects'):
            MODULE.binding_rows([{'tenant': 'x', 'project': 'y', 'recorder': 'z'}] * 11)


if __name__ == '__main__':
    unittest.main()
