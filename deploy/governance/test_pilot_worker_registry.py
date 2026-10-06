"""Offline registry/provisioning contract checks; no VPS or provider access."""

import importlib.util
import pathlib
import sqlite3
import tempfile
import json
from contextlib import closing
import unittest
from unittest.mock import patch
from pilot_worker_registry import instance_for, validate_registry, verify_journal_binding

HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    'provision_pilot_worker', HERE / 'provision-pilot-project-worker.py')
PROVISION = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROVISION)
RUNTIME_SPEC = importlib.util.spec_from_file_location(
    'check_pilot_runtime', HERE / 'check-pilot-runtime-health.py')
RUNTIME = importlib.util.module_from_spec(RUNTIME_SPEC)
RUNTIME_SPEC.loader.exec_module(RUNTIME)
BACKUP_SPEC = importlib.util.spec_from_file_location(
    'check_pilot_backup', HERE / 'check-pilot-backup-health.py')
BACKUP = importlib.util.module_from_spec(BACKUP_SPEC)
BACKUP_SPEC.loader.exec_module(BACKUP)
TENANT = 'org-831aa048-b268-4fce-98f3-455429034ef8'
PROJECTS = ('prj-d9109260-1232-4561-ab4a-ab2e5c8f658f',
            'prj-a9109260-1232-4561-ab4a-ab2e5c8f658f')


def worker(project, recorder, relayer):
    instance = instance_for(TENANT, project)
    return {'tenant': TENANT, 'project': project,
            'role': f'worker_{instance}',
            'unit': f'aichain-governance-project-worker@{instance}.service',
            'journal': f'/var/lib/aichain-governance-workers/{instance}/worker.sqlite',
            'state': 'paused', 'recorder': recorder, 'relayer': relayer}


class InventoryTests(unittest.TestCase):
    def test_inactive_worker_state_is_preserved_by_health_checks(self):
        class Result:
            returncode = 3
            stdout = 'inactive\n'

        with patch.object(RUNTIME.subprocess, 'run', return_value=Result()):
            self.assertEqual(RUNTIME.systemctl('is-active', 'paused.service'), 'inactive')
        with patch.object(BACKUP.subprocess, 'run', return_value=Result()):
            self.assertEqual(BACKUP.systemctl('is-active', 'paused.service'), 'inactive')

    def test_two_projects_have_isolated_deterministic_bindings(self):
        workers = [worker(PROJECTS[0], '0x' + '1' * 40, '0x' + '2' * 40),
                   worker(PROJECTS[1], '0x' + '3' * 40, '0x' + '4' * 40)]
        self.assertEqual(validate_registry({'version': 1, 'environment': 'test',
                                            'workers': workers}), workers)
        self.assertNotEqual(workers[0]['role'], workers[1]['role'])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            validate_registry({'version': 1, 'environment': 'test',
                               'workers': [workers[0], {**workers[1],
                                                        'relayer': workers[0]['relayer']}]})
        with self.assertRaisesRegex(ValueError, 'binding'):
            validate_registry({'version': 1, 'environment': 'test',
                               'workers': [{**workers[0], 'journal': workers[1]['journal']}]})

    def test_request_requires_bounded_reviewed_funding(self):
        request = {'tenant': TENANT, 'project': PROJECTS[0],
                   'databaseUrlFile': str(HERE / 'database-url'),
                   'databaseCaFile': str(HERE / 'ca.crt'),
                   'rpcUrl': 'https://sepolia.base.org',
                   'workerPolicy': {'batchSize': 100, 'maxTransactionsPerHour': 10,
                                    'maxGasPriceWei': '100000000',
                                    'dailyReservationWei': '1000000000000000',
                                    'l1AllowanceWei': '10000000000000'},
                   'fundingTargetWei': '1000000000000000',
                   'reviewId': 'pilot-review-1234'}
        self.assertEqual(PROVISION.request_plan(request)['role'],
                         'worker_' + instance_for(TENANT, PROJECTS[0]))
        with self.assertRaisesRegex(ValueError, 'funding'):
            PROVISION.request_plan({**request, 'fundingTargetWei': '0'})
        with self.assertRaisesRegex(ValueError, 'funding'):
            PROVISION.request_plan({**request, 'workerPolicy': {**request['workerPolicy'],
                                                               'batchSize': 1001}})

    def test_journal_identity_must_match_registered_project_and_signers(self):
        entry = worker(PROJECTS[0], '0x' + '1' * 40, '0x' + '2' * 40)
        with tempfile.TemporaryDirectory() as directory:
            journal = pathlib.Path(directory) / 'worker.sqlite'
            with closing(sqlite3.connect(journal)) as db:
                db.execute('CREATE TABLE governance_environment(name TEXT)')
                db.execute("INSERT INTO governance_environment VALUES('test')")
                db.execute('CREATE TABLE config(id INTEGER PRIMARY KEY,body TEXT)')
                identity = {'scope': {'tenant': TENANT, 'project': PROJECTS[0]},
                            'publisher': entry['relayer'].lower(),
                            'recorder': entry['recorder'].lower(), 'chain': 84532,
                            'contract': '0x5781540e4682a9d35011c94a25f615e438e8e7af'}
                db.execute('INSERT INTO config VALUES(1,?)', (json.dumps(identity),))
                db.commit()
            journal.chmod(0o600)
            binding = {**entry, 'journal': str(journal)}
            verify_journal_binding(binding)
            with self.assertRaisesRegex(ValueError, 'differs'):
                verify_journal_binding({**binding, 'project': PROJECTS[1]})

    def test_worker_health_scans_only_bounded_unresolved_jobs(self):
        with tempfile.TemporaryDirectory() as directory:
            journal = pathlib.Path(directory) / 'worker.sqlite'
            with closing(sqlite3.connect(journal)) as db:
                db.execute('CREATE TABLE governance_environment(name TEXT)')
                db.execute("INSERT INTO governance_environment VALUES('test')")
                db.execute('CREATE TABLE jobs(id TEXT PRIMARY KEY,body TEXT)')
                for index in range(1200):
                    db.execute('INSERT INTO jobs VALUES(?,?)',
                               (str(index), json.dumps({'state': 'confirmed'})))
                db.execute('INSERT INTO jobs VALUES(?,?)',
                           ('pending', json.dumps({'state': 'submitted',
                                                    'at': 1000000, 'attempts': 2})))
                db.commit()
            result = RUNTIME.worker_jobs(journal)
            self.assertEqual(result['total'], 1201)
            self.assertEqual(result['unresolved'], 1)
            self.assertEqual(result['maxUnresolvedAttempts'], 2)
            self.assertFalse(RUNTIME.worker_journal_healthy(result))
            self.assertTrue(RUNTIME.worker_journal_healthy({**result,
                                                            'oldestUnresolvedAgeSeconds': 60}))
            self.assertFalse(RUNTIME.worker_journal_healthy({**result,
                                                             'oldestUnresolvedAgeSeconds': 60,
                                                             'maxUnresolvedAttempts': 3}))


if __name__ == '__main__':
    unittest.main()
