"""Offline tests for portal activation and rollback state transitions."""
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    'release_pilot_portal', HERE / 'release-pilot-portal.py')
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)


def archive_at(path, unsafe=False):
    with tarfile.open(path, 'w:gz') as stream:
        for name in ('server.js', 'dist/index.js', 'node_modules/package.json'):
            payload = b'new portal'
            info = tarfile.TarInfo(name)
            info.size = len(payload)
            stream.addfile(info, io.BytesIO(payload))
        if unsafe:
            info = tarfile.TarInfo('../outside')
            info.size = 1
            stream.addfile(info, io.BytesIO(b'x'))


class PortalReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = pathlib.Path(self.temp.name)
        self.archive = self.base / 'portal.tar.gz'
        archive_at(self.archive)
        self.current = self.base / 'current'
        self.current.mkdir()
        (self.current / 'marker').write_text('old')
        self.releases = self.base / 'releases'
        self.releases.mkdir()
        patch_current = mock.patch.object(RELEASE, 'CURRENT', self.current)
        patch_releases = mock.patch.object(RELEASE, 'RELEASES', self.releases)
        patch_verify = mock.patch.object(RELEASE, 'verify_archive')
        for patch in (patch_current, patch_releases, patch_verify):
            patch.start()
            self.addCleanup(patch.stop)

    def test_activate_then_explicit_rollback(self):
        with mock.patch.object(RELEASE, 'restart_and_check', return_value=True):
            RELEASE.activate(self.archive, 'a' * 64, 'r1')
            self.assertTrue((self.current / 'server.js').is_file())
            self.assertEqual((self.releases / 'r1.previous' / 'marker').read_text(), 'old')
            RELEASE.rollback('r1')
        self.assertEqual((self.current / 'marker').read_text(), 'old')
        self.assertTrue((self.releases / 'r1.failed' / 'server.js').exists())

    def test_failed_health_check_restores_prior_build(self):
        with mock.patch.object(RELEASE, 'restart_and_check', side_effect=(False, True)):
            with self.assertRaisesRegex(RuntimeError, 'prior build restored'):
                RELEASE.activate(self.archive, 'a' * 64, 'r2')
        self.assertEqual((self.current / 'marker').read_text(), 'old')
        self.assertTrue((self.releases / 'r2.failed' / 'server.js').exists())

    def test_rejects_archive_path_traversal(self):
        archive_at(self.archive, unsafe=True)
        with self.assertRaisesRegex(ValueError, 'unsafe entry'):
            RELEASE.unpack_archive(self.archive, self.base / 'unsafe-stage')
        self.assertFalse((self.base.parent / 'outside').exists())

    def test_release_id_is_restricted(self):
        for value in ('../foo', 'A', '', 'foo/bar'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                RELEASE.release_paths(value)


if __name__ == '__main__':
    unittest.main()
