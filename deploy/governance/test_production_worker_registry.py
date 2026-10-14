"""Offline checks for Production project, signer and journal backup coverage."""

import json
import pathlib
import sqlite3
import tempfile
import unittest
from contextlib import closing
from unittest import mock

import production_worker_registry as registry


TENANT = 'org-831aa048-b268-4fce-98f3-455429034ef8'
PROJECT = 'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f'
OTHER = 'prj-a9109260-1232-4561-ab4a-ab2e5c8f658f'
CHAIN = {'chainId': 8453, 'contract': '0x' + '1' * 40,
         'codeHash': '0x' + 'a' * 64}


def entry(project=PROJECT, recorder='0x' + '2' * 40, relayer='0x' + '3' * 40):
    instance = registry.instance_for(TENANT, project)
    return {'tenant': TENANT, 'project': project, 'role': 'worker_' + instance,
            'unit': f'orvessian-production-project-worker@{instance}.service',
            'journal': str(registry.STATE / instance / 'worker.sqlite'),
            'state': 'paused', 'recorder': recorder, 'relayer': relayer}


class ProductionRegistryTests(unittest.TestCase):
    def test_empty_registry_is_allowed_before_chain_decision(self):
        self.assertEqual(registry.validate_registry({
            'version': 1, 'environment': 'prod', 'chain': None,
            'workers': []}), [])
        with self.assertRaisesRegex(ValueError, 'chain binding'):
            registry.validate_registry({'version': 1, 'environment': 'prod',
                                        'chain': None, 'workers': [entry()]})

    def test_exact_project_and_signer_coverage(self):
        workers = [entry(), entry(OTHER, '0x' + '4' * 40, '0x' + '5' * 40)]
        document = {'version': 1, 'environment': 'prod',
                    'chain': CHAIN, 'workers': workers}
        self.assertEqual(registry.validate_registry(document), workers)
        catalog = [{'tenant': TENANT, 'project': PROJECT},
                   {'tenant': TENANT, 'project': OTHER}]
        registry.verify_catalog(workers, catalog)
        with self.assertRaisesRegex(ValueError, 'coverage'):
            registry.verify_catalog(workers, catalog[:1])
        with self.assertRaisesRegex(ValueError, 'Duplicate'):
            registry.validate_registry({**document, 'workers': [workers[0],
                {**workers[1], 'relayer': workers[0]['relayer']}]})
        with self.assertRaisesRegex(ValueError, 'binding'):
            registry.validate_registry({**document, 'workers': [
                {**workers[0], 'journal': workers[1]['journal']}]})
        with self.assertRaisesRegex(ValueError, 'binding'):
            registry.validate_registry({**document, 'workers': [
                {**workers[0], 'recorder': workers[0]['relayer']}]})

    def test_journal_identity_matches_selected_chain_and_project(self):
        with tempfile.TemporaryDirectory(dir=pathlib.Path(__file__).parent) as temporary, \
                mock.patch.object(registry, 'STATE', pathlib.Path(temporary)):
            worker = entry()
            journal = pathlib.Path(worker['journal'])
            journal.parent.mkdir()
            with closing(sqlite3.connect(journal)) as db:
                db.execute('CREATE TABLE governance_environment(name TEXT)')
                db.execute("INSERT INTO governance_environment VALUES('prod')")
                db.execute('CREATE TABLE config(id INTEGER PRIMARY KEY,body TEXT)')
                identity = {'scope': {'tenant': TENANT, 'project': PROJECT},
                            'publisher': worker['relayer'].lower(),
                            'recorder': worker['recorder'].lower(),
                            'contract': CHAIN['contract'], 'chain': CHAIN['chainId']}
                db.execute('INSERT INTO config VALUES(1,?)', (json.dumps(identity),))
                db.commit()
            journal.chmod(0o600)
            registry.verify_journal_binding(worker, CHAIN)
            with self.assertRaisesRegex(ValueError, 'chain binding'):
                registry.validate_registry({'version': 1, 'environment': 'prod',
                                            'chain': {**CHAIN, 'chainId': 84532},
                                            'workers': [worker]})
            with self.assertRaisesRegex(ValueError, 'differs'):
                registry.verify_journal_binding(worker, {**CHAIN,
                    'contract': '0x' + '4' * 40})
            with self.assertRaisesRegex(ValueError, 'differs'):
                registry.verify_journal_binding({**worker, 'project': OTHER}, CHAIN)


if __name__ == '__main__':
    unittest.main()
