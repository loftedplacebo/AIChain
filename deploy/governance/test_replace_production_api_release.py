"""Inactive production API replacement retains an exact offline rollback."""

import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest import mock

from deploy.governance.test_stage_production_api_release import archive_at


SOURCE = pathlib.Path(__file__).with_name('replace-production-api-release.py')
SPEC = importlib.util.spec_from_file_location('replace_production_api_release', SOURCE)
REPLACE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPLACE)
OLD = 'a' * 40
NEW = 'b' * 40


class ProductionReleaseReplacementTest(unittest.TestCase):
    def test_replaces_then_rolls_back_without_starting_service(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary)
            release = root / 'production-api'
            release.mkdir()
            (release / 'PRODUCTION-RELEASE.json').write_text(json.dumps({
                'sourceCommit': OLD, 'archiveSha256': 'c' * 64,
                'service': REPLACE.STAGE.UNIT, 'activation': 'disabled',
            }), encoding='utf-8')
            archive = root / 'next.tar.gz'
            digest = archive_at(archive)
            with mock.patch.object(REPLACE, 'RELEASE', release), \
                    mock.patch.object(REPLACE.STAGE, 'check_unit') as check:
                REPLACE.replace(archive, digest, NEW, OLD)
                self.assertEqual(REPLACE.manifest(release, NEW)['archiveSha256'], digest)
                self.assertTrue((root / ('production-api.previous-' + OLD[:12])).exists())
                self.assertEqual(check.call_count, 2)
                REPLACE.rollback(NEW, OLD)
                self.assertEqual(REPLACE.manifest(release, OLD)['archiveSha256'], 'c' * 64)
                self.assertTrue((root / ('production-api.reverted-' + NEW[:12])).exists())
                self.assertEqual(check.call_count, 4)

    def test_wrong_previous_commit_refuses_replacement(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            root = pathlib.Path(temporary)
            release = root / 'production-api'
            release.mkdir()
            (release / 'PRODUCTION-RELEASE.json').write_text(json.dumps({
                'sourceCommit': OLD, 'archiveSha256': 'c' * 64,
                'service': REPLACE.STAGE.UNIT, 'activation': 'disabled',
            }), encoding='utf-8')
            archive = root / 'next.tar.gz'
            digest = archive_at(archive)
            with mock.patch.object(REPLACE, 'RELEASE', release), \
                    mock.patch.object(REPLACE.STAGE, 'check_unit'):
                with self.assertRaisesRegex(ValueError, 'identity mismatch'):
                    REPLACE.replace(archive, digest, NEW, 'd' * 40)
            self.assertEqual(REPLACE.manifest(release, OLD)['archiveSha256'], 'c' * 64)


if __name__ == '__main__':
    unittest.main()
