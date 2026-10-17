"""Offline release interruption and rollback checks for the webhook-only API."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_api_active_replace', HERE / 'replace-production-api-active.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


NEW = 'a' * 40
OLD = 'b' * 40
ARCHIVE = pathlib.Path('/synthetic/reviewed-api.tar.gz')


class ProductionActiveReleaseTests(unittest.TestCase):
    def run_swap(self, command):
        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(module, 'LOCK', pathlib.Path(temporary) / 'release.lock'), \
                mock.patch.object(module, 'preflight', return_value=10), \
                mock.patch.object(module, 'command', side_effect=command) as issued, \
                mock.patch.object(module.REPLACE, 'replace') as replaced, \
                mock.patch.object(module.REPLACE, 'manifest') as manifest, \
                mock.patch.object(module.REPLACE, 'rollback') as rollback, \
                mock.patch.object(module, 'wait_live') as healthy:
            try:
                module.apply(ARCHIVE, 'c' * 64, NEW, OLD)
                outcome = 'active'
            except ValueError as error:
                outcome = str(error)
            return outcome, issued.call_args_list, replaced.call_count, \
                manifest.call_count, rollback.call_count, healthy.call_count

    def test_success_keeps_webhook_service_enabled(self):
        outcome, calls, replaced, _, rollback, checks = self.run_swap(
            lambda *args, **kwargs: '')
        self.assertEqual(outcome, 'active')
        self.assertEqual(replaced, 1)
        self.assertEqual(rollback, 0)
        self.assertEqual(checks, 1)
        self.assertEqual([call.args[1:3] for call in calls],
                         [('disable', '--now'), ('enable', '--now')])

    def test_failed_restart_restores_previous_release_and_service(self):
        attempts = {'enable': 0}

        def command(*args, **kwargs):
            if args[1] == 'enable':
                attempts['enable'] += 1
                if attempts['enable'] == 1:
                    raise ValueError('Synthetic restart failure')
            return ''

        outcome, calls, replaced, manifests, rollback, checks = self.run_swap(command)
        self.assertIn('rolled back', outcome)
        self.assertEqual(replaced, 1)
        self.assertEqual(manifests, 1)
        self.assertEqual(rollback, 1)
        self.assertEqual(checks, 1)
        self.assertEqual([call.args[1:3] for call in calls],
                         [('disable', '--now'), ('enable', '--now'),
                          ('disable', '--now'), ('enable', '--now')])


if __name__ == '__main__':
    unittest.main()
