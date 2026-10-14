"""Synthetic preflight tests; never contact the VPS or start/stop services."""

import importlib.util
import io
import pathlib
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
SPEC = importlib.util.spec_from_file_location(
    'production_journal_backup', ROOT / 'run-production-journal-backup.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class Schema:
    ADMIN = pathlib.Path('/synthetic/admin')
    HOST = 'synthetic.example.test'
    CA = pathlib.Path('/synthetic/ca.crt')

    @staticmethod
    def protected(path, maximum):
        if path.name == 'backup.key':
            return 'a' * 64
        if path.name == 'b2-upload-credentials.json':
            return '{"accessKeyId":"synthetic","secretAccessKey":"synthetic"}'
        return 'b' * 64

    @staticmethod
    def psql(user, password, sql):
        if 'governance_environment' in sql:
            return 'prod'
        if 'governance_customer_projects' in sql:
            return '[{"tenant":"org-synthetic","project":"prj-synthetic"}]'
        raise AssertionError('Unexpected SQL')


WORKER = {
    'tenant': 'org-synthetic', 'project': 'prj-synthetic',
    'role': 'worker_' + 'a' * 24,
    'unit': 'orvessian-production-project-worker@' + 'a' * 24 + '.service',
    'journal': '/synthetic/worker.sqlite', 'state': 'active',
    'recorder': '0x' + '11' * 20, 'relayer': '0x' + '22' * 20,
}
CHAIN = {'chainId': 8453, 'contract': '0x' + '33' * 20,
         'codeHash': '0x' + '44' * 32}


class PreflightTests(unittest.TestCase):
    def test_complete_catalog_and_active_worker_required(self):
        def status(unit):
            if unit == module.common.PORTAL:
                return {'UnitFileState=disabled', 'ActiveState=inactive'}
            return {'UnitFileState=enabled', 'ActiveState=active'}

        with mock.patch.object(module, 'pinned_core'), \
             mock.patch.object(module.common, 'status', side_effect=status), \
             mock.patch.object(module, 'load_registry', return_value=(
                 {'chain': CHAIN}, [WORKER])), \
             mock.patch.object(module, 'verify_journal_binding') as journal, \
             mock.patch.object(module.common, 'run') as run:
            admin, workers, chain, portal = module.preflight(Schema())
            self.assertEqual(admin, 'b' * 64)
            self.assertEqual(workers, [WORKER])
            self.assertEqual(chain, CHAIN)
            self.assertFalse(portal)
            journal.assert_called_once_with(WORKER, CHAIN)
            run.assert_not_called()

            with mock.patch.object(Schema, 'psql', side_effect=lambda user, password, sql:
                                   'prod' if 'governance_environment' in sql else '[]'):
                with self.assertRaisesRegex(ValueError, 'coverage'):
                    module.preflight(Schema())

            with mock.patch.object(module, 'load_registry', return_value=(
                    {'chain': None}, [])):
                with self.assertRaisesRegex(ValueError, 'workers'):
                    module.preflight(Schema())

    def test_quiesced_capture_uploads_all_journals_and_restarts_writers(self):
        backup_id='11111111-2222-4333-8444-555555555555'
        with tempfile.TemporaryDirectory(prefix='synthetic-prod-journal-') as temp:
            archive=pathlib.Path(temp)/'archives'
            directory=archive/'pg-backup-synthetic'
            directory.mkdir(parents=True)
            active={module.common.API:True,WORKER['unit']:True}
            calls=[]
            fail_backup=False

            def status(unit):
                return {'UnitFileState=enabled',
                        'ActiveState=active' if active[unit] else
                        'ActiveState=inactive'}

            def run(*args, **kwargs):
                calls.append(args)
                if args[0]=='systemctl':
                    active[args[2]]=args[1]=='start'
                    return SimpleNamespace(stdout='')
                if args[2]=='backup':
                    if fail_backup:
                        raise ValueError('Synthetic capture failed')
                    return SimpleNamespace(stdout=json_text({
                        'operation':'backup','environment':'prod','id':backup_id,
                        'directory':str(directory),'journalRoles':[WORKER['role']]}))
                if args[2]=='inspect':
                    return SimpleNamespace(stdout=json_text({
                        'operation':'inspect','integrity':'verified',
                        'freshness':'fresh','id':backup_id,
                        'journalRoles':[WORKER['role']]}))
                if args[2]=='upload':
                    return SimpleNamespace(stdout=json_text({
                        'operation':'upload','id':backup_id,'environment':'prod',
                        'bucket':module.common.BUCKET,
                        'journalRoles':[WORKER['role']],
                        'upload':'complete-marker-written'}))
                raise AssertionError('Unexpected command')

            with mock.patch.object(module.common,'ARCHIVES',archive), \
                 mock.patch.object(module.common,'status',side_effect=status), \
                 mock.patch.object(module.common,'run',side_effect=run), \
                 mock.patch.object(module,'verify_journal_binding'), \
                 redirect_stdout(io.StringIO()):
                module.capture_and_upload(Schema(),'b'*64,[WORKER],CHAIN,False)
                self.assertTrue(all(active.values()))
                self.assertEqual([call[1] for call in calls if call[0]=='systemctl'],
                                 ['stop','stop','start','start'])
                self.assertEqual(len([call for call in calls if 'upload' in call]),1)
                calls.clear()
                fail_backup=True
                with self.assertRaisesRegex(ValueError,'Synthetic capture failed'):
                    module.capture_and_upload(Schema(),'b'*64,[WORKER],CHAIN,False)
                self.assertTrue(all(active.values()))
                self.assertEqual([call[1] for call in calls if call[0]=='systemctl'],
                                 ['stop','stop','start','start'])


def json_text(value):
    import json
    return json.dumps(value)


if __name__ == '__main__':
    unittest.main()
