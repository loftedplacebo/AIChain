"""The API installer rejects the wrong endpoint and never prints credentials."""

import contextlib
import importlib.util
import io
import json
import os
import pathlib
import tempfile
import unittest
from unittest import mock


SOURCE = pathlib.Path(__file__).with_name('install-production-workos-webhook-from-api.py')
SPEC = importlib.util.spec_from_file_location('webhook_api_installer', SOURCE)
INSTALLER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(INSTALLER)
API_KEY = 'sk_synthetic_production_only_1234567890'
SECRET = 'whsec_synthetic_production_only_1234567890'


class FakeResponse:
    status = 200

    def __init__(self, payload):
        self.stream = io.BytesIO(json.dumps(payload).encode('ascii'))

    def __enter__(self):
        return self

    def read(self, count=-1):
        return self.stream.read(count)

    def __exit__(self, *_):
        return False


def listing(**changes):
    endpoint = {'id': INSTALLER.ENDPOINT_ID,
                'endpoint_url': INSTALLER.ENDPOINT_URL,
                'status': 'enabled', 'events': ['session.revoked'],
                'secret': SECRET}
    endpoint.update(changes)
    return {'data': [endpoint], 'list_metadata': {'after': None}}


class ProductionWebhookApiInstallerTest(unittest.TestCase):
    def test_exact_scope_and_secret(self):
        with mock.patch.object(INSTALLER.urllib.request, 'urlopen',
                               return_value=FakeResponse(listing())):
            self.assertEqual(INSTALLER.fetch_secret(API_KEY), SECRET)
        plain_secret = 'SyntheticWorkOSSecret12345'
        with mock.patch.object(INSTALLER.urllib.request, 'urlopen',
                               return_value=FakeResponse(listing(secret=plain_secret))):
            self.assertEqual(INSTALLER.fetch_secret(API_KEY), plain_secret)
        for change in ({'endpoint_url': 'https://elsewhere.invalid'},
                       {'events': ['session.created']},
                       {'status': 'disabled'}, {'secret': 'masked'}):
            with self.subTest(change=change), \
                    mock.patch.object(INSTALLER.urllib.request, 'urlopen',
                                      return_value=FakeResponse(listing(**change))):
                with self.assertRaises(ValueError):
                    INSTALLER.fetch_secret(API_KEY)
        with mock.patch.object(INSTALLER.urllib.request, 'urlopen',
                               return_value=FakeResponse({'data': 'invalid'})):
            with self.assertRaises(ValueError):
                INSTALLER.fetch_secret(API_KEY)

    def test_install_is_root_only_and_one_shot(self):
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
                    mock.patch.object(INSTALLER, 'fetch_secret', return_value=SECRET), \
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


if __name__ == '__main__':
    unittest.main()
