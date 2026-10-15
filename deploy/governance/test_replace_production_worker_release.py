"""Synthetic offline worker release replacement and rollback."""

import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'production_worker_replace', HERE / 'replace-production-worker-release.py')
module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(module)
OLD = 'a' * 40
NEW = 'b' * 40


class ReplacementTests(unittest.TestCase):
    def test_exact_inactive_replace_and_rollback(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            release = root / 'production-worker'
            release.mkdir()
            archive = root / 'new.tar.gz'
            with tarfile.open(archive, 'w:gz') as package:
                data = b'new worker\n'
                item = tarfile.TarInfo('scripts/governance-production-worker.cjs')
                item.size = len(data)
                package.addfile(item, io.BytesIO(data))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            pins = {OLD: '1'*64, NEW: digest}
            (release / 'PRODUCTION-WORKER-RELEASE.json').write_text(json.dumps({
                'sourceCommit': OLD, 'archiveSha256': pins[OLD],
                'serviceTemplate': module.STAGE.UNIT.name,
                'activation': 'disabled',
            }))
            with mock.patch.object(module, 'RELEASE', release), \
                 mock.patch.object(module, 'PINS', pins), \
                 mock.patch.object(module, 'offline'), \
                 mock.patch.object(module.STAGE, 'inspect_archive', return_value=1), \
                 redirect_stdout(io.StringIO()):
                with mock.patch.object(sys, 'argv', ['replace-production-worker-release.py',
                     '--archive', str(archive), '--sha256', digest,
                     '--commit', NEW, '--previous', OLD, '--apply']):
                    module.main()
                self.assertEqual(module.manifest(release, NEW)['sourceCommit'], NEW)
                prior = root / ('production-worker.previous-' + OLD[:12])
                self.assertEqual(module.manifest(prior, OLD)['sourceCommit'], OLD)
                with mock.patch.object(sys, 'argv', ['replace-production-worker-release.py',
                     '--commit', NEW, '--previous', OLD, '--rollback', '--apply']):
                    module.main()
                self.assertEqual(module.manifest(release, OLD)['sourceCommit'], OLD)
                reverted = root / ('production-worker.reverted-' + NEW[:12])
                self.assertEqual(module.manifest(reverted, NEW)['sourceCommit'], NEW)

    def test_unpinned_successor_rejected_before_mutation(self):
        with mock.patch.object(sys, 'argv', ['replace-production-worker-release.py',
             '--commit', '0'*40, '--previous', OLD]), \
             mock.patch.object(module, 'offline') as offline:
            with self.assertRaisesRegex(ValueError, 'pinned'):
                module.main()
            offline.assert_not_called()


if __name__ == '__main__':
    unittest.main()
