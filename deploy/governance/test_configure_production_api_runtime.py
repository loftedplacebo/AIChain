"""The production API installer preserves secrets and refuses a live unit."""

import contextlib
import importlib.util
import io
import os
import pathlib
import tempfile
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name('configure-production-api-runtime.py')
SPEC = importlib.util.spec_from_file_location('production_api_runtime', SOURCE)
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)
BASE = ('GOVERNANCE_DATABASE_URL=postgres://synthetic-only\n'
        'GOVERNANCE_DATABASE_CA_FILE=/synthetic/ca.pem\n'
        'GOVERNANCE_IDENTITY_SEAL_KEY=' + 'a' * 64 + '\n')


class ProductionRuntimeInstallerTest(unittest.TestCase):
    def setup_file(self, directory):
        target = pathlib.Path(directory) / 'production.env'
        target.write_text(BASE, encoding='utf-8')
        target.chmod(0o600)
        return target

    def unit(self, active='inactive'):
        return mock.Mock(returncode=0,
                         stdout='UnitFileState=disabled\nActiveState=' + active + '\n')

    def test_installs_closed_admission_without_printing_existing_values(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as directory:
            target = self.setup_file(directory)
            output = io.StringIO()
            with mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0,
                                      create=True), \
                    mock.patch.object(INSTALLER.os, 'fchmod', create=True), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=self.unit()), \
                    contextlib.redirect_stdout(output):
                INSTALLER.install(INSTALLER.inspect())
            content = target.read_text(encoding='utf-8')
            self.assertTrue(content.startswith(BASE))
            self.assertIn('WORKOS_ADMISSION_MODE=production-list\n', content)
            self.assertIn('PORT=8791\n', content)
            if os.name == 'posix':
                self.assertEqual(target.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('postgres://synthetic-only', output.getvalue())
            self.assertNotIn('WORKOS_WEBHOOK_SECRET=', content)

    def test_refuses_live_unit_and_unexpected_fields(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as directory:
            target = self.setup_file(directory)
            with mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0,
                                      create=True), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=self.unit('active')):
                with self.assertRaises(ValueError):
                    INSTALLER.inspect()
            target.write_text(BASE + 'WORKOS_API_KEY=synthetic\n', encoding='utf-8')
            with mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0,
                                      create=True), \
                    mock.patch.object(INSTALLER.subprocess, 'run', return_value=self.unit()):
                with self.assertRaises(ValueError):
                    INSTALLER.inspect()


if __name__ == '__main__':
    unittest.main()
