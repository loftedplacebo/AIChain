"""Offline checks for restricted Production worker database setup."""

import contextlib
import importlib.util
import io
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_worker_database', HERE / 'configure-production-worker-database.py')
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class ProductionWorkerDatabaseTests(unittest.TestCase):
    def module(self):
        return SimpleNamespace(
            CA=pathlib.Path('/synthetic/ca.pem'),
            scram_verifier=lambda password: 'SCRAM-SHA-256$synthetic',
            psql=mock.Mock(return_value=''))

    def test_verified_login_is_stored_only_in_private_file(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = pathlib.Path(temporary) / 'worker-database-url'
            module = self.module()
            output = io.StringIO()
            with mock.patch.object(installer, 'DESTINATION', destination), \
                    mock.patch.object(installer, 'NODE', pathlib.Path('/synthetic/node')), \
                    mock.patch.object(installer, 'RELEASE', pathlib.Path('/synthetic/release')), \
                    mock.patch.object(installer.secrets, 'token_hex', return_value='a' * 64), \
                    mock.patch.object(installer.subprocess, 'run', return_value=SimpleNamespace(
                        returncode=0, stdout='production_worker_grants=verified\n')), \
                    contextlib.redirect_stdout(output):
                installer.install(module, 'synthetic-admin')
            self.assertEqual(destination.stat().st_mode & 0o777, 0o600)
            self.assertIn('governance_prod_worker:' + 'a' * 64,
                          destination.read_text(encoding='ascii'))
            self.assertNotIn('a' * 64, output.getvalue())
            self.assertEqual(module.psql.call_count, 1)
            self.assertIn(' LOGIN PASSWORD ', module.psql.call_args.args[2])

    def test_failed_grant_verification_reverts_login(self):
        with tempfile.TemporaryDirectory() as temporary:
            destination = pathlib.Path(temporary) / 'worker-database-url'
            module = self.module()
            with mock.patch.object(installer, 'DESTINATION', destination), \
                    mock.patch.object(installer, 'NODE', pathlib.Path('/synthetic/node')), \
                    mock.patch.object(installer, 'RELEASE', pathlib.Path('/synthetic/release')), \
                    mock.patch.object(installer.secrets, 'token_hex', return_value='b' * 64), \
                    mock.patch.object(installer.subprocess, 'run', return_value=SimpleNamespace(
                        returncode=1, stdout='')):
                with self.assertRaisesRegex(ValueError, 'grant'):
                    installer.install(module, 'synthetic-admin')
            self.assertFalse(destination.exists())
            self.assertEqual(module.psql.call_count, 2)
            self.assertIn(' NOLOGIN PASSWORD NULL', module.psql.call_args.args[2])


if __name__ == '__main__':
    unittest.main()
