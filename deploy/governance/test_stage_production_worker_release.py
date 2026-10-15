"""Synthetic initial Production worker release staging; no systemd changes."""

import hashlib
import importlib.util
import io
import json
import pathlib
import tarfile
import tempfile
import unittest
import sys
from contextlib import redirect_stdout
from types import SimpleNamespace
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_worker_release', HERE / 'stage-production-worker-release.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)


class StageTests(unittest.TestCase):
    def test_one_time_helper_rejects_wrong_source_commit(self):
        with mock.patch.object(sys, 'argv', ['stage-production-worker-release.py',
             '--archive', '/synthetic/worker.tar.gz', '--sha256', module.ARCHIVE_SHA256,
             '--commit', '0'*40]), \
             mock.patch.object(module, 'preflight') as preflight:
            with self.assertRaisesRegex(ValueError, 'Pinned Production worker'):
                module.main()
            preflight.assert_not_called()

    def test_exact_archive_and_inactive_template(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            archive = root / 'worker.tar.gz'
            unit = root / 'worker@.service'
            source = root / 'source-worker@.service'
            release = root / 'worker-release'
            source.write_text('[Unit]\nDescription=Synthetic Production worker\n')
            required = sorted(module.REQUIRED)
            with tarfile.open(archive, 'w:gz') as package:
                for name in required:
                    data = b'synthetic release source\n'
                    item = tarfile.TarInfo(name)
                    item.size = len(data)
                    package.addfile(item, io.BytesIO(data))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            commit = 'a' * 40

            def systemd(args, **kwargs):
                if args[:2] == ('systemctl', 'is-enabled'):
                    return SimpleNamespace(returncode=1, stdout='disabled\n')
                return SimpleNamespace(returncode=0, stdout='')

            with mock.patch.object(module, 'RELEASE', release), \
                 mock.patch.object(module, 'SOURCE_UNIT', source), \
                 mock.patch.object(module, 'UNIT', unit), \
                 mock.patch.object(module, 'UNIT_SHA256',
                                   hashlib.sha256(source.read_bytes()).hexdigest()), \
                 mock.patch.object(module, 'load_registry', return_value=({}, [])), \
                 mock.patch.object(module.subprocess, 'run', side_effect=systemd), \
                 redirect_stdout(io.StringIO()):
                self.assertEqual(module.preflight(archive, digest), len(required))
                module.stage(archive, digest, commit)
                self.assertTrue((release / 'scripts/governance-production-worker.cjs').is_file())
                manifest = json.loads((release / 'PRODUCTION-WORKER-RELEASE.json').read_text())
                self.assertEqual(manifest['archiveSha256'], digest)
                self.assertEqual(unit.read_bytes(), source.read_bytes())
                with self.assertRaisesRegex(ValueError, 'unit required'):
                    module.preflight(archive, digest)


if __name__ == '__main__':
    unittest.main()
