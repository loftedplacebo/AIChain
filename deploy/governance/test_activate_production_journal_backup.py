"""Synthetic timer handoff checks without changing systemd."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'activate_production_journal_backup',
    HERE / 'activate-production-journal-backup.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
BACKUP_ID = '11111111-2222-4333-8444-555555555555'


class ActivateJournalBackupTests(unittest.TestCase):
    def run_handoff(self, healthy):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(MODULE, 'LOCK', pathlib.Path(temporary) / 'handoff.lock'), \
                mock.patch.object(MODULE.HANDOFF, 'preflight', return_value=1), \
                mock.patch.object(MODULE, 'unit_file'), \
                mock.patch.object(MODULE, 'wait_for_first_run'), \
                mock.patch.object(MODULE, 'new_timer_healthy', return_value=True), \
                mock.patch.object(MODULE, 'command', side_effect=lambda *args, **kwargs:
                                  '{"healthy":' + str(healthy).lower() + '}'
                                  if args[0] == 'python3' else '') as command:
            try:
                MODULE.apply(BACKUP_ID)
                result = 'active'
            except ValueError as error:
                result = str(error)
            return result, [call.args for call in command.call_args_list]

    def test_success_enables_only_journal_timer(self):
        result, calls = self.run_handoff(True)
        self.assertEqual(result, 'active')
        self.assertEqual(calls[0], ('systemctl', 'disable', '--now', MODULE.OLD))
        self.assertEqual(calls[1], ('systemctl', 'enable', '--now', MODULE.NEW))
        self.assertEqual(len(calls), 3)

    def test_failed_health_restores_previous_timer(self):
        result, calls = self.run_handoff(False)
        self.assertIn('rolled back', result)
        self.assertEqual(calls[-2:], [
            ('systemctl', 'disable', '--now', MODULE.NEW),
            ('systemctl', 'enable', '--now', MODULE.OLD),
        ])


if __name__ == '__main__':
    unittest.main()
