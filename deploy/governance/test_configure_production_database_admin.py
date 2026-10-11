"""Production administrator credential installation stays private and verified."""

import contextlib
import importlib.util
import io
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name('configure-production-database-admin.py')
SPEC = importlib.util.spec_from_file_location('production_admin_installer', SOURCE)
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)


class ProductionAdminInstallerTest(unittest.TestCase):
    def test_verified_tls_connection_keeps_password_out_of_arguments(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            ca = pathlib.Path(temporary) / 'ca.crt'
            ca.write_text('synthetic certificate', encoding='utf-8')
            completed = subprocess.CompletedProcess([], 0, 'doadmin|governance_prod\n', '')
            with mock.patch.object(INSTALLER, 'CA', ca), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=completed) as run:
                INSTALLER.verify('synthetic-private-password')
            args = run.call_args.args[0]
            self.assertNotIn('synthetic-private-password', str(args))
            self.assertIn('sslmode=verify-full', str(args))
            self.assertEqual(run.call_args.kwargs['env']['PGPASSWORD'], '')

    def test_unverified_password_never_replaces_protected_file(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary) / 'production'
            root.mkdir(mode=0o700)
            destination = root / 'database-admin-password'
            destination.write_text('old-synthetic\n', encoding='utf-8')
            with mock.patch.object(INSTALLER, 'ROOT', root), \
                    mock.patch.object(INSTALLER, 'DESTINATION', destination), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(INSTALLER.os, 'fchmod', create=True), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', return_value='new-synthetic-password'), \
                    mock.patch.object(INSTALLER, 'verify', side_effect=ValueError('bad credential')):
                with self.assertRaises(ValueError):
                    INSTALLER.main()
            self.assertEqual(destination.read_text(encoding='utf-8'), 'old-synthetic\n')

    def test_success_stores_root_only_file_without_printing_secret(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary) / 'production'
            root.mkdir(mode=0o700)
            destination = root / 'database-admin-password'
            output = io.StringIO()
            with mock.patch.object(INSTALLER, 'ROOT', root), \
                    mock.patch.object(INSTALLER, 'DESTINATION', destination), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(INSTALLER.os, 'fchmod', create=True), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', return_value='new-synthetic-password'), \
                    mock.patch.object(INSTALLER, 'verify'), contextlib.redirect_stdout(output):
                INSTALLER.main()
            self.assertEqual(destination.read_text(encoding='utf-8'), 'new-synthetic-password\n')
            self.assertNotIn('new-synthetic-password', output.getvalue())


if __name__ == '__main__':
    unittest.main()
