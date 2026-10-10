"""Offline checks for the coupled API/worker release state transitions."""
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
from unittest import mock

HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    'release_pilot_runtime', HERE / 'release-pilot-runtime.py')
RELEASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(RELEASE)
ACTIVE_UNITS = RELEASE.active_units


def archive_at(path, component, extra=None):
    names = ['scripts/governance-hosted-synthetic-api.cjs',
             'services/governance/index.cjs', 'sdk/typescript/index.cjs',
             'node_modules/pg/package.json', 'node_modules/ethers/package.json',
             'node_modules/jose/package.json'] if component == 'api' else [
                 'scripts/governance-worker.cjs',
                 'scripts/governance-worker-recover-lock.cjs',
                 'services/governance/index.cjs', 'sdk/typescript/index.cjs']
    with tarfile.open(path, 'w:gz') as stream:
        for name in names:
            payload = b'safe source'
            entry = tarfile.TarInfo(name)
            entry.size = len(payload)
            stream.addfile(entry, io.BytesIO(payload))
        if extra:
            entry = tarfile.TarInfo(extra)
            entry.size = 1
            stream.addfile(entry, io.BytesIO(b'x'))


class RuntimeReleaseTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.base = pathlib.Path(temporary.name)
        self.current = {}
        self.archives = {}
        for component in ('api', 'worker'):
            current = self.base / component
            current.mkdir()
            (current / 'marker').write_text('old ' + component)
            self.current[component] = current
            archive = self.base / (component + '.tar.gz')
            archive_at(archive, component)
            self.archives[component] = archive
        releases = self.base / 'releases'
        releases.mkdir()
        for name, value in (('CURRENT', self.current), ('RELEASES', releases),
                            ('verify_archive', mock.Mock())):
            patch = mock.patch.object(RELEASE, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        self.hashes = {name: 'a' * 64 for name in self.current}
        patch = mock.patch.object(RELEASE, 'active_units', return_value=['api', 'worker'])
        patch.start()
        self.addCleanup(patch.stop)
        for name in ('stop_units', 'start_units'):
            value = mock.Mock(return_value=['api', 'worker'] if name == 'stop_units' else None)
            patch = mock.patch.object(RELEASE, name, value)
            patch.start()
            self.addCleanup(patch.stop)
        patch = mock.patch.object(RELEASE, 'link_worker_dependencies')
        patch.start()
        self.addCleanup(patch.stop)
        patch = mock.patch.object(RELEASE.subprocess, 'run',
                                  return_value=mock.Mock(returncode=0))
        patch.start()
        self.addCleanup(patch.stop)

    def test_activate_and_explicit_rollback_restore_both_components(self):
        with mock.patch.object(RELEASE, 'check_health', return_value=True):
            RELEASE.activate(self.archives, self.hashes, 'r1', [])
            self.assertTrue((self.current['api'] / 'node_modules/pg/package.json').is_file())
            RELEASE.link_worker_dependencies.assert_called_once()
            RELEASE.rollback('r1', [])
        for name in self.current:
            self.assertEqual((self.current[name] / 'marker').read_text(), 'old ' + name)

    def test_failed_health_restores_both_prior_builds(self):
        with mock.patch.object(RELEASE, 'check_health', side_effect=(False, True)):
            with self.assertRaisesRegex(RuntimeError, 'prior build restored'):
                RELEASE.activate(self.archives, self.hashes, 'r2', [])
        for name in self.current:
            self.assertEqual((self.current[name] / 'marker').read_text(), 'old ' + name)

    def test_unsafe_archive_rejected_before_service_stop(self):
        archive_at(self.archives['api'], 'api', '../outside')
        with self.assertRaisesRegex(ValueError, 'unsafe entry'):
            RELEASE.activate(self.archives, self.hashes, 'r3', [])
        RELEASE.stop_units.assert_not_called()
        self.assertFalse((self.base.parent / 'outside').exists())

    def test_rejects_missing_registered_service(self):
        with mock.patch.object(RELEASE.subprocess, 'run',
                                  return_value=mock.Mock(returncode=1)):
            with self.assertRaisesRegex(ValueError, 'Every registered service'):
                ACTIVE_UNITS([{'unit': 'worker'}])


if __name__ == '__main__':
    unittest.main()
