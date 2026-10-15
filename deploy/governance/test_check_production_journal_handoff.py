"""Synthetic handoff checks; never switch a live timer."""

import importlib.util
import json
import os
import pathlib
import tempfile
import time
import unittest
from datetime import datetime, timezone
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_journal_handoff',
    HERE / 'check-production-journal-handoff.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

ID = '11111111-2222-4333-8444-555555555555'
ROLE = 'worker_' + 'a' * 24
PREFIX = 'orvessian-production/prod/' + ID + '-synthetic'
CHAIN = {'chainId': 8453, 'contract': '0x' + '11' * 20,
         'codeHash': '0x' + '22' * 32}


class HandoffTests(unittest.TestCase):
    def test_only_latest_exact_restored_set_is_ready(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-prod-handoff-') as temp:
            root = pathlib.Path(temp)
            pointer = root / 'latest-b2.json'
            pointer.write_text('{}')
            acceptance = root / 'journal-restore-acceptance.json'
            accepted = {
                'version': 1, 'environment': 'prod', 'backupId': ID,
                'keyPrefix': PREFIX, 'journalRoles': [ROLE],
                'chain': CHAIN, 'result': 'closed-restore-review-passed',
                'completedAt': datetime.now(timezone.utc).isoformat(),
            }
            acceptance.write_text(json.dumps(accepted))
            acceptance.chmod(0o600)
            now = time.time()
            os.utime(pointer, (now - 10, now - 10))
            os.utime(acceptance, (now, now))

            def state(verb, unit):
                if verb == 'is-active':
                    return 'active' if unit == module.OLD_TIMER else 'inactive'
                return 'enabled' if unit == module.OLD_TIMER else 'disabled'

            with mock.patch.object(module.drill, 'ACCEPTANCE', acceptance), \
                 mock.patch.object(module.drill.base, 'LATEST', pointer), \
                 mock.patch.object(module.drill, 'preflight',
                                   return_value=(PREFIX, [{'role': ROLE}],
                                                 CHAIN)), \
                 mock.patch.object(module, 'unit_state', side_effect=state):
                self.assertEqual(module.preflight(ID), 1)
                accepted['journalRoles'] = []
                acceptance.write_text(json.dumps(accepted))
                with self.assertRaisesRegex(ValueError, 'matching closed restore'):
                    module.preflight(ID)
                accepted['journalRoles'] = [ROLE]
                acceptance.write_text(json.dumps(accepted))
                os.utime(pointer, (now + 1, now + 1))
                with self.assertRaisesRegex(ValueError, 'matching closed restore'):
                    module.preflight(ID)
                os.utime(pointer, (now - 10, now - 10))
                with mock.patch.object(module, 'unit_state', return_value='inactive'):
                    with self.assertRaisesRegex(ValueError, 'timer state'):
                        module.preflight(ID)


if __name__ == '__main__':
    unittest.main()
