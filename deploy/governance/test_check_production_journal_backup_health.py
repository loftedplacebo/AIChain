"""Synthetic coverage checks; never read the live database or call systemd."""

import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_journal_backup_health',
    HERE / 'check-production-journal-backup-health.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
ROLE = 'worker_' + 'a' * 24
WORKER = {'role': ROLE, 'unit': 'worker-synthetic.service'}
NOW = 1_797_000_000.0


class HealthTests(unittest.TestCase):
    def test_complete_journal_scope_and_timer_handoff(self):
        due = module.base.latest_due(NOW)
        with tempfile.TemporaryDirectory() as temporary:
            pointer = pathlib.Path(temporary) / 'latest-b2.json'
            pointer.write_text(json.dumps({
                'version': 2, 'environment': 'prod',
                'bucket': module.journal.common.BUCKET,
                'keyPrefix': 'orvessian-production/prod/' +
                             '1'*8+'-'+'1'*4+'-'+'1'*4+'-'+'1'*4+'-'+'1'*12+
                             '-'+'2'*8+'-'+'2'*4+'-'+'2'*4+'-'+'2'*4+'-'+'2'*12,
                'journalRoles': [ROLE],
            }))
            pointer.chmod(0o600)
            import os
            os.utime(pointer, (due.timestamp()+60, due.timestamp()+60))

            class Schema:
                ADMIN = pathlib.Path('/synthetic/admin')

                @staticmethod
                def protected(path, maximum):
                    return 'synthetic'

                @staticmethod
                def psql(user, password, sql):
                    return 'prod'

            def systemctl(command, *args):
                name = args[-1]
                if command == 'is-active':
                    return 'inactive' if name == module.OLD_TIMER else 'active'
                if command == 'is-enabled':
                    return 'disabled' if name == module.OLD_TIMER else 'enabled'
                return 'success'

            with mock.patch.object(module, 'POINTER', pointer), \
                 mock.patch.object(module.journal.common, 'module', return_value=Schema()), \
                 mock.patch.object(module, 'load_registry', return_value=(
                     {'chain': {'chainId': 8453}}, [WORKER])), \
                 mock.patch.object(module.journal, 'catalog', return_value=[
                     {'tenant': 'org-synthetic', 'project': 'prj-synthetic'}]), \
                 mock.patch.object(module, 'verify_catalog'), \
                 mock.patch.object(module, 'verify_journal_binding'), \
                 mock.patch.object(module.base, 'systemctl', side_effect=systemctl):
                self.assertTrue(module.report(NOW)['healthy'])
                document = json.loads(pointer.read_text())
                document['journalRoles'] = []
                pointer.write_text(json.dumps(document))
                os.utime(pointer, (due.timestamp()+60, due.timestamp()+60))
                result = module.report(NOW)
                self.assertFalse(result['healthy'])
                self.assertFalse(result['marker_worker_scope_matches_registry'])


if __name__ == '__main__':
    unittest.main()
