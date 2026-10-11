"""WorkOS Production API keys remain hidden and cannot be overwritten casually."""

import contextlib
import importlib.util
import io
import pathlib
import tempfile
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name('configure-production-workos-key.py')
SPEC = importlib.util.spec_from_file_location('production_workos_installer', SOURCE)
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)
KEY = 'sk_synthetic_production_only_1234567890'


class ProductionWorkosInstallerTest(unittest.TestCase):
    def test_key_stays_in_protected_file_and_out_of_output(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary) / 'production'
            root.mkdir(mode=0o700)
            target = root / 'workos.env'
            output = io.StringIO()
            with mock.patch.object(INSTALLER, 'ROOT', root), \
                    mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(INSTALLER.os, 'fchmod', create=True), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', return_value=KEY), \
                    contextlib.redirect_stdout(output):
                INSTALLER.main()
            self.assertEqual(target.read_text(encoding='ascii'), 'WORKOS_API_KEY=' + KEY + '\n')
            self.assertNotIn(KEY, output.getvalue())

    def test_invalid_or_existing_key_file_is_not_replaced(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary) / 'production'
            root.mkdir(mode=0o700)
            target = root / 'workos.env'
            with mock.patch.object(INSTALLER, 'ROOT', root), \
                    mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', return_value='bad-key'):
                with self.assertRaises(ValueError):
                    INSTALLER.main()
            self.assertFalse(target.exists())
            target.write_text('prior-synthetic\n', encoding='ascii')
            with mock.patch.object(INSTALLER, 'ROOT', root), \
                    mock.patch.object(INSTALLER, 'DESTINATION', target), \
                    mock.patch.object(INSTALLER.os, 'geteuid', return_value=0, create=True), \
                    mock.patch.object(INSTALLER.getpass, 'getpass', side_effect=AssertionError('prompted')):
                with self.assertRaises(ValueError):
                    INSTALLER.main()
            self.assertEqual(target.read_text(encoding='ascii'), 'prior-synthetic\n')


if __name__ == '__main__':
    unittest.main()
