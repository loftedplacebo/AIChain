"""Synthetic failure checks for the owner preview's Nginx rollback."""

import importlib.util
import pathlib
import tempfile
import unittest
from unittest import mock


SPEC = importlib.util.spec_from_file_location(
    'owner_preview', pathlib.Path(__file__).with_name(
        'activate-production-owner-preview.py'))
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class OwnerPreviewTests(unittest.TestCase):
    def test_failed_preview_restores_webhook_only_edge(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            site, candidate, backup = (root / name for name in
                                       ('site.conf', 'candidate.conf', 'backup.conf'))
            site.write_bytes(b'webhook-only')
            candidate.write_bytes(b'owner-preview')
            active = []

            def command(*args, **_kwargs):
                active.append(args)
                if args == ('systemctl', 'is-active', '--quiet', MODULE.PORTAL):
                    return False
                return True

            def edge_is(expected):
                if expected is MODULE.PREVIEW:
                    return False
                return site.read_bytes() == b'webhook-only'

            with mock.patch.object(MODULE, 'SITE', site), \
                    mock.patch.object(MODULE, 'CANDIDATE', candidate), \
                    mock.patch.object(MODULE, 'BACKUP', backup), \
                    mock.patch.object(MODULE, 'prerequisites'), \
                    mock.patch.object(MODULE, 'checked_file'), \
                    mock.patch.object(MODULE, 'private_portal_ready', return_value=True), \
                    mock.patch.object(MODULE, 'run', side_effect=command), \
                    mock.patch.object(MODULE, 'edge_is', side_effect=edge_is):
                with self.assertRaisesRegex(ValueError, 'edge check failed'):
                    MODULE.apply()
            self.assertEqual(site.read_bytes(), b'webhook-only')
            self.assertEqual(backup.read_bytes(), b'webhook-only')
            self.assertIn(('systemctl', 'stop', MODULE.PORTAL), active)
            self.assertEqual(sum(args == ('systemctl', 'reload', 'nginx')
                                 for args in active), 2)


if __name__ == '__main__':
    unittest.main()
