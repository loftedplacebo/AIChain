"""The Production webhook installer is one-shot and keeps secrets out of output."""

import contextlib
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name('configure-production-workos-webhook.py')
SPEC = importlib.util.spec_from_file_location('production_webhook_installer', SOURCE)
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)
API_KEY = 'sk_synthetic_production_only_1234567890'
SECRET = 'whsec_synthetic_production_only_1234567890'


class ProductionWebhookInstallerTest(unittest.TestCase):
    def test_hidden_install_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as directory:
            target = pathlib.Path(directory) / 'workos.env'
            target.write_text('WORKOS_API_KEY=' + API_KEY + '\n', encoding='ascii')
            target.chmod(0o600)
            unit = mock.Mock(returncode=0,
                             stdout='UnitFileState=disabled\nActiveState=inactive\n')
            output = io.StringIO()
            with mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0,
                                      create=True), \
                    mock.patch.object(INSTALLER.os, 'fchmod', create=True), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=unit), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', return_value=SECRET), \
                    contextlib.redirect_stdout(output):
                INSTALLER.main()
                with self.assertRaises(ValueError):
                    INSTALLER.main()
            self.assertEqual(target.read_text(encoding='ascii'),
                             'WORKOS_API_KEY=' + API_KEY + '\n'
                             'WORKOS_WEBHOOK_SECRET=' + SECRET + '\n')
            self.assertNotIn(API_KEY, output.getvalue())
            self.assertNotIn(SECRET, output.getvalue())
            if os.name == 'posix':
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)

    def test_active_unit_refuses_secret_prompt(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as directory:
            target = pathlib.Path(directory) / 'workos.env'
            target.write_text('WORKOS_API_KEY=' + API_KEY + '\n', encoding='ascii')
            target.chmod(0o600)
            unit = mock.Mock(returncode=0,
                             stdout='UnitFileState=disabled\nActiveState=active\n')
            with mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0,
                                      create=True), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=unit), \
                    mock.patch.object(INSTALLER.getpass, 'getpass',
                                      side_effect=AssertionError('prompted')):
                with self.assertRaises(ValueError):
                    INSTALLER.main()


if __name__ == '__main__':
    unittest.main()
