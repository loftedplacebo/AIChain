"""Synthetic journal restore review; no PostgreSQL process is contacted."""

import importlib.util
import io
import json
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    'production_closed_restore', HERE / 'restore-production-backup-closed.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

ROLE = 'worker_' + 'a' * 24
WORKER = {'role': ROLE, 'tenant': 'org-synthetic',
          'project': 'prj-synthetic', 'journal': '/synthetic/worker.sqlite',
          'relayer': '0x'+'11'*20, 'recorder': '0x'+'22'*20}
CHAIN = {'chainId': 8453, 'contract': '0x'+'33'*20,
         'codeHash': '0x'+'44'*32}
ID = '11111111-2222-4333-8444-555555555555'


class ClosedRestoreTests(unittest.TestCase):
    def test_worker_role_review_requires_exact_closed_journal(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-prod-restore-') as temp:
            root = pathlib.Path(temp)
            result_dir = root/'pg-restore-synthetic'
            result_dir.mkdir()
            outputs = [
                {'operation':'restore','backupId':ID,'environment':'prod',
                 'targetDatabase':'placeholder','access':'revoked-and-disabled',
                 'activation':'review-required','journalRoles':[ROLE],
                 'directory':str(result_dir),
                 'journalsDirectory':'restore-synthetic'},
                {'operation':'review','review':'passed','environment':'prod',
                 'activation':'review-required','journalRoles':[ROLE]},
            ]

            def run(*args, **kwargs):
                output = outputs.pop(0).copy()
                if output['operation']=='restore':
                    config = json.loads(pathlib.Path(args[0][3]).read_text())
                    output['targetDatabase']=config['targetDatabase']
                return SimpleNamespace(returncode=0,stdout=json.dumps(output))

            with mock.patch.object(module,'RESTORES',root), \
                 mock.patch.object(module.subprocess,'run',side_effect=run), \
                 mock.patch.object(module,'verify_journal_binding') as verify, \
                 redirect_stdout(io.StringIO()):
                module.restore(root,'synthetic-admin',ID,
                               expected_workers=[WORKER],chain=CHAIN)
            self.assertEqual(outputs,[])
            self.assertTrue(verify.call_args.kwargs['require_review_gate'])
            self.assertEqual(verify.call_args.kwargs['journal_path'],
                             result_dir/'restore-synthetic'/(ROLE+'.sqlite'))


if __name__ == '__main__':
    unittest.main()
