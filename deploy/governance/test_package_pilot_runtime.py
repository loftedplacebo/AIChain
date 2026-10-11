"""Check reproducible packaging and the runtime archive boundary."""
import importlib.util
import pathlib
import tarfile
import tempfile
import unittest
from unittest import mock
import sys

HERE = pathlib.Path(__file__).parent
SPEC = importlib.util.spec_from_file_location(
    'package_pilot_runtime', HERE / 'package-pilot-runtime.py')
PACKAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PACKAGE)


class PackageTests(unittest.TestCase):
    def test_archives_are_deterministic_and_worker_has_no_dependencies(self):
        with tempfile.TemporaryDirectory(dir=HERE) as temporary:
            root = pathlib.Path(temporary)
            for name in ('scripts', 'services/governance', 'sdk/typescript',
                         'node_modules/pg'):
                directory = root / name
                directory.mkdir(parents=True)
                (directory / 'entry.cjs').write_text('source')
            first = root / 'first.tar.gz'
            second = root / 'second.tar.gz'
            self.assertEqual(PACKAGE.package(root, first, 'api'),
                             PACKAGE.package(root, second, 'api'))
            worker = root / 'worker.tar.gz'
            PACKAGE.package(root, worker, 'worker')
            with tarfile.open(worker, 'r:gz') as archive:
                self.assertFalse(any(name.startswith('node_modules/')
                                     for name in archive.getnames()))

    def test_api_only_mode_does_not_emit_a_worker_archive(self):
        with tempfile.TemporaryDirectory(dir=HERE) as temporary:
            root = pathlib.Path(temporary)
            for name in ('scripts', 'services/governance', 'sdk/typescript',
                         'node_modules/pg'):
                directory = root / name
                directory.mkdir(parents=True)
                (directory / 'entry.cjs').write_text('source')
            with mock.patch.object(sys, 'argv', ['package-pilot-runtime.py',
                                                 '--source', str(root),
                                                 '--output-dir', str(root),
                                                 '--release-id', 'production-test',
                                                 '--component', 'api']):
                PACKAGE.main()
            self.assertTrue((root / 'production-test-api.tar.gz').is_file())
            self.assertFalse((root / 'production-test-worker.tar.gz').exists())


if __name__ == '__main__':
    unittest.main()
