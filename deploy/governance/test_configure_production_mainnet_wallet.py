"""Synthetic hidden-prompt wallet installer test; uses a disposable key."""

import importlib.util
import io
import pathlib
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_mainnet_wallet',
    HERE / 'configure-production-mainnet-wallet.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
SYNTHETIC_KEY = '0x' + '1' * 64


class WalletInstallerTests(unittest.TestCase):
    def test_hidden_install_and_idempotent_read(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            root.chmod(0o700)
            key = root / 'mainnet-publisher.key'
            output = io.StringIO()
            with mock.patch.object(module, 'ROOT', root), \
                 mock.patch.object(module, 'KEY', key), \
                 mock.patch.object(module.getpass, 'getpass',
                                   return_value=SYNTHETIC_KEY), \
                 redirect_stdout(output):
                module.main()
                module.main()
            self.assertEqual(key.stat().st_mode & 0o777, 0o600)
            self.assertEqual(key.read_text().strip(), SYNTHETIC_KEY)
            self.assertEqual(output.getvalue().count('address=0x'), 2)
            self.assertNotIn(SYNTHETIC_KEY, output.getvalue())


if __name__ == '__main__':
    unittest.main()
