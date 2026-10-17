"""Offline checks for first-cohort Production worker preparation."""

import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
import sqlite3

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    'provision_production_project_worker',
    HERE / 'provision-production-project-worker.py')
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)
from production_worker_registry import verify_journal_binding


TENANT = 'org-831aa048-b268-4fce-98f3-455429034ef8'
PROJECT = 'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f'
CHAIN = {'chainId': 8453, 'contract': '0x' + 'A' * 40,
         'codeHash': '0x' + 'a' * 64}


def request():
    return {'tenant': TENANT, 'project': PROJECT,
            'databaseUrlFile': '/synthetic/prod-worker-db-url',
            'rpcUrl': 'https://mainnet.base.org', 'reviewId': 'first-cohort-001',
            'fundingTargetWei': '200000000000000',
            'workerPolicy': {'batchSize': 100, 'maxTransactionsPerHour': 4,
                             'maxGasPriceWei': '1000000000',
                             'dailyReservationWei': '100000000000000',
                             'l1AllowanceWei': '10000000000000'}}


class ProductionProvisioningTests(unittest.TestCase):
    def test_exact_project_and_capped_funding(self):
        valid = request()
        plan = worker.request_plan(valid)
        self.assertTrue(plan['unit'].endswith(plan['instance'] + '.service'))
        for change in ({'fundingTargetWei': '200000000000001'},
                       {'rpcUrl': 'https://sepolia.base.org'},
                       {'tenant': 'org-synthetic'},
                       {'workerPolicy': {**valid['workerPolicy'],
                                         'dailyReservationWei': '300000000000000'}}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                worker.request_plan({**valid, **change})

    def test_worker_database_must_be_exclusive_and_verified(self):
        good = ('postgresql://governance_prod_worker:synthetic@'
                'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
                ':25060/governance_prod?sslmode=verify-full')
        worker.verify_database_url(good)
        for bad in (good.replace('governance_prod_worker', 'doadmin'),
                    good.replace('governance_prod', 'governance_test'),
                    good.replace('verify-full', 'disable'),
                    good + '\nGOVERNANCE_WORKER_ENABLED=true'):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                worker.verify_database_url(bad)

    def test_catalog_requires_complete_coverage_during_handoff(self):
        target = {'tenant': TENANT, 'project': PROJECT}
        worker.verify_catalog([target], [], request())
        other = {'tenant': TENANT,
                 'project': 'prj-a9109260-1232-4561-ab4a-ab2e5c8f658f'}
        with self.assertRaisesRegex(ValueError, 'coverage'):
            worker.verify_catalog([target, other], [], request())
        worker.verify_catalog([target, other], [other], request())
        with self.assertRaisesRegex(ValueError, 'coverage'):
            worker.verify_catalog([target, target], [], request())

    def test_prebound_journal_matches_registry_and_preserves_identity(self):
        with tempfile.TemporaryDirectory() as temporary:
            journal = pathlib.Path(temporary) / 'worker.sqlite'
            valid = request()
            recorder = '0x' + '2' * 40
            relayer = '0x' + '3' * 40
            worker.prepare_journal(journal, 0, 0, valid, CHAIN, recorder, relayer)
            self.assertEqual(journal.stat().st_mode & 0o777, 0o600)
            entry = {'tenant': TENANT, 'project': PROJECT,
                     'role': 'worker_' + worker.request_plan(valid)['instance'],
                     'unit': worker.request_plan(valid)['unit'],
                     'journal': str(journal), 'state': 'paused',
                     'recorder': recorder, 'relayer': relayer}
            verify_journal_binding(entry, CHAIN, journal_path=journal)
            expected = {'principal': {'tenant': TENANT, 'project': PROJECT},
                        'publisher': relayer, 'recorder': recorder,
                        'anchor': {'contract': CHAIN['contract'].lower()}}
            runtime = pathlib.Path(os.environ.get(
                'ORVESSIAN_WORKER_TEST_RUNTIME', str(worker.RUNTIME)))
            inspected = subprocess.run((worker.NODE, '-e',
                                       "require('./scripts/governance-production-worker.cjs')"
                                       ".journalMarker(process.argv[1],undefined,JSON.parse(process.argv[2]))",
                                       str(journal), json.dumps(expected)),
                                      cwd=runtime, capture_output=True,
                                      text=True, check=False, timeout=10)
            self.assertEqual(inspected.returncode, 0, inspected.stderr[:1200])
            worker.prepare_journal(journal, 0, 0, valid, CHAIN, recorder, relayer)
            with closing(sqlite3.connect(journal)) as db:
                self.assertEqual(db.execute('SELECT count(*) FROM config').fetchone(), (1,))
                self.assertEqual(json.loads(
                    db.execute('SELECT body FROM config').fetchone()[0])['contract'],
                    CHAIN['contract'].lower())
            with self.assertRaisesRegex(ValueError, 'differs'):
                verify_journal_binding({**entry, 'relayer': '0x' + '4' * 40},
                                       CHAIN, journal_path=journal)

    def test_generated_private_key_yields_only_a_public_address(self):
        with tempfile.TemporaryDirectory() as temporary:
            key = pathlib.Path(temporary) / 'relayer.key'
            first = worker.address_for(key, 0, 0)
            self.assertRegex(first, r'^0x[0-9a-fA-F]{40}$')
            self.assertEqual(worker.address_for(key, 0, 0), first)
            self.assertEqual(key.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
