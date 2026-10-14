"""Synthetic journal-aware B2 restore preflight; all external calls mocked."""

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
from production_worker_registry import instance_for


HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    'journal_b2_restore', HERE / 'verify-production-journal-b2-restore.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)

ID = '11111111-2222-4333-8444-555555555555'
TENANT = 'org-831aa048-b268-4fce-98f3-455429034ef8'
PROJECT = 'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f'
ROLE = 'worker_' + instance_for(TENANT, PROJECT)
WORKER = {'tenant': TENANT, 'project': PROJECT, 'role': ROLE}
CHAIN = {'chainId': 8453, 'contract': '0x' + '11' * 20,
         'codeHash': '0x' + '22' * 32}


class Schema:
    ADMIN = pathlib.Path('/synthetic/database-admin')

    def __init__(self, roles):
        self.roles = roles

    def protected(self, path, maximum):
        if path == module.base.KEY or path == module.base.ADMIN:
            return 'a' * 64
        if path == module.base.RESTORE:
            return json.dumps({'accessKeyId': 'synthetic123456',
                               'secretAccessKey': 'x' * 32})
        if path == module.base.LATEST:
            return json.dumps({'version': 2, 'environment': 'prod',
                               'bucket': module.base.BUCKET,
                               'keyPrefix': 'orvessian-production/prod/' + ID +
                                            '-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
                               'journalRoles': self.roles})
        return 'b' * 64


class RestorePreflightTests(unittest.TestCase):
    def test_exact_journal_set_and_closed_restore_dependencies(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-prod-b2-') as temporary:
            runner = pathlib.Path(temporary)
            transfer = runner/'scripts/governance-backup-object-storage.cjs'
            transfer.parent.mkdir()
            transfer.write_text('synthetic')
            closed = runner/'closed.py'
            closed.write_text('synthetic')
            schema = Schema([ROLE])
            with mock.patch.object(module.base, 'import_module', return_value=schema), \
                 mock.patch.object(module, 'load_registry', return_value=(
                     {'chain': CHAIN}, [WORKER])), \
                 mock.patch.object(module.journal, 'catalog', return_value=[
                     {'tenant': TENANT, 'project': PROJECT}]), \
                 mock.patch.object(module.journal, 'pinned_core'), \
                 mock.patch.object(module, 'recovery_cluster'), \
                 mock.patch.object(module.base, 'RUNNER', runner), \
                 mock.patch.object(module.base, 'CLOSED', closed), \
                 mock.patch.object(module.base, 'download_and_restore') as download:
                prefix, workers, chain = module.preflight(ID)
                self.assertTrue(prefix.startswith('orvessian-production/prod/'+ID))
                self.assertEqual(workers, [WORKER])
                self.assertEqual(chain, CHAIN)
                download.assert_not_called()
                schema.roles = []
                with self.assertRaisesRegex(ValueError, 'pointer scope'):
                    module.preflight(ID)

    def test_authenticated_download_forwards_exact_worker_scope_to_closed_restore(self):
        with tempfile.TemporaryDirectory(prefix='synthetic-prod-b2-download-') as temp:
            root=pathlib.Path(temp)
            directory=root/'download-synthetic'
            directory.mkdir()
            downloaded={'operation':'download','environment':'prod','id':ID,
                        'integrity':'verified','journalRoles':[ROLE],
                        'directory':str(directory)}
            closed=SimpleNamespace(restore=mock.Mock())
            schema=SimpleNamespace(protected=mock.Mock(return_value='a'*64))
            def load(name, path):
                return closed if name=='production_closed_restore' else schema
            result=SimpleNamespace(returncode=0,stdout=json.dumps(downloaded))
            with mock.patch.object(module.base,'DOWNLOADS',root), \
                 mock.patch.object(module.base.subprocess,'run',return_value=result), \
                 mock.patch.object(module.base,'import_module',side_effect=load), \
                 redirect_stdout(io.StringIO()):
                module.base.download_and_restore(ID,
                    'orvessian-production/prod/'+ID+'-synthetic',
                    expected_workers=[WORKER],chain=CHAIN)
            self.assertEqual(closed.restore.call_args.args[2],ID)
            self.assertEqual(closed.restore.call_args.kwargs,
                             {'expected_workers':[WORKER],'chain':CHAIN})


if __name__ == '__main__':
    unittest.main()
