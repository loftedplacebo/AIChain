"""Offline checks for transactional SQL release and fallback behavior."""
import importlib.util
import hashlib
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).parent
sys.path.insert(0, str(HERE))
SPEC = importlib.util.spec_from_file_location(
    'release_pilot_database', HERE / 'release-pilot-database.py')
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


class DatabaseReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = pathlib.Path(temporary.name)
        self.up = self.base / 'up.sql'
        self.down = self.base / 'down.sql'
        self.up.write_text('ALTER TABLE sample ADD COLUMN new_value text;')
        self.down.write_text('ALTER TABLE sample DROP COLUMN new_value;')
        self.hashes = ('a' * 64, 'b' * 64)
        self.workers = [{'state': 'active', 'unit': 'worker'}]

    def patches(self):
        values = {'verify_sql': mock.Mock(), 'check_backup': mock.Mock(),
                  'database_connection': mock.Mock(return_value=({'PGPASSWORD': 'dummy'}, 'local-dsn')),
                  'units': mock.Mock(return_value=['portal', 'api', 'worker']),
                  'stop': mock.Mock(return_value=['portal', 'api', 'worker']),
                  'start': mock.Mock(), 'run_migration': mock.Mock(),
                  'check_runtime': mock.Mock(return_value=True)}
        self.enterContext(mock.patch.multiple(RELEASE, **values))
        self.enterContext(mock.patch.object(RELEASE.subprocess, 'run',
                                           return_value=mock.Mock(returncode=0)))
        return values

    def test_apply_calls_one_transaction_with_pinned_up_sql(self):
        calls = self.patches()
        RELEASE.execute('apply', self.up, self.down, *self.hashes, 'r1', self.workers)
        calls['run_migration'].assert_called_once_with(
            self.up, 'r1', *self.hashes, 'apply', mock.ANY, 'local-dsn')
        calls['start'].assert_called_once()

    def test_failed_health_reverses_applied_schema_before_restart(self):
        calls = self.patches()
        calls['check_runtime'].return_value = False
        with self.assertRaisesRegex(RuntimeError, 'Hosted health failed'):
            RELEASE.execute('apply', self.up, self.down, *self.hashes, 'r2', self.workers)
        self.assertEqual(calls['run_migration'].call_args_list[-1].args[:5],
                         (self.down, 'r2', *self.hashes, 'rollback'))

    def test_failed_explicit_rollback_reapplies_prior_schema(self):
        calls = self.patches()
        calls['check_runtime'].return_value = False
        with self.assertRaisesRegex(RuntimeError, 'Hosted health failed'):
            RELEASE.execute('rollback', self.up, self.down, *self.hashes,
                            'r3', self.workers)
        self.assertEqual(calls['run_migration'].call_args_list[-1].args[:5],
                         (self.up, 'r3', *self.hashes, 'apply'))

    def test_release_record_guards_rollback_digests(self):
        preamble, postamble = RELEASE.sql_statements('r4', *self.hashes,
                                                     'rollback')
        self.assertTrue(preamble.startswith('SET LOCAL ROLE governance_migrations;'))
        self.assertIn(self.hashes[0], preamble)
        self.assertIn(self.hashes[1], preamble)
        self.assertIn('Release record mismatch', preamble)
        self.assertIn('DELETE FROM', postamble)

    def test_meta_command_and_manual_commit_are_rejected(self):
        for content in ('\\! echo unsafe', 'SELECT 1; COMMIT;'):
            with self.subTest(content=content):
                self.up.write_text(content)
                with mock.patch.object(pathlib.Path, 'lstat',
                                       return_value=mock.Mock(
                                           st_mode=0o100644, st_uid=0,
                                           st_size=len(content))):
                    with self.assertRaisesRegex(ValueError, 'transaction or psql'):
                        RELEASE.verify_sql(
                            self.up, hashlib.sha256(content.encode()).hexdigest())

    def test_local_database_binding_required_for_release(self):
        managed = {'profile': 'managed'}
        with mock.patch.object(RELEASE, 'load_admin', return_value=managed):
            with self.assertRaisesRegex(ValueError, 'local Contabo profile'):
                RELEASE.database_connection()
        local = {'profile': 'contabo-local', 'host': '127.0.0.1', 'port': 5433,
                 'database': 'governance_test', 'user': 'postgres',
                 'sslmode': 'disable', 'password': 'synthetic-secret'}
        with mock.patch.object(RELEASE, 'load_admin', return_value=local), \
                mock.patch.object(RELEASE, 'psql_environment', return_value={'PGPASSWORD': 'synthetic-secret'}):
            environment, dsn = RELEASE.database_connection()
        self.assertEqual(environment['PGPASSWORD'], 'synthetic-secret')
        self.assertEqual(dsn, 'host=127.0.0.1 port=5433 dbname=governance_test user=postgres sslmode=disable')


if __name__ == '__main__':
    unittest.main()
