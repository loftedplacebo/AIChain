"""Reject unsafe or incomplete production API archives before VPS staging."""

import importlib.util
import hashlib
import io
import pathlib
import tarfile
import tempfile
import unittest


SOURCE = pathlib.Path(__file__).with_name('stage-production-api-release.py')
SPEC = importlib.util.spec_from_file_location('stage_production_api_release', SOURCE)
STAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STAGE)


def archive_at(path, extra=(), link=False):
    with tarfile.open(path, 'w:gz') as output:
        for name in sorted(STAGE.REQUIRED | set(extra)):
            item = tarfile.TarInfo(name)
            item.mode = 0o644
            if link and name == 'scripts/governance-production-api.cjs':
                item.type = tarfile.SYMTYPE
                item.linkname = '/etc/passwd'
                output.addfile(item)
            else:
                data = b'synthetic source'
                item.size = len(data)
                output.addfile(item, io.BytesIO(data))
    return hashlib.sha256(path.read_bytes()).hexdigest()


class ProductionArchiveTest(unittest.TestCase):
    def test_required_archive_is_accepted_and_wrong_hash_rejected(self):
        with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
            archive = pathlib.Path(temporary) / 'api.tar.gz'
            digest = archive_at(archive)
            self.assertEqual(STAGE.inspect_archive(archive, digest), len(STAGE.REQUIRED))
            with self.assertRaisesRegex(ValueError, 'SHA-256'):
                STAGE.inspect_archive(archive, '0' * 64)

    def test_traversal_secret_and_symlink_members_are_rejected(self):
        for name, link in [('scripts/../escape.cjs', False),
                           ('scripts/prod.env', False),
                           ('scripts/governance-production-api.cjs', True)]:
            with self.subTest(name=name, link=link):
                with tempfile.TemporaryDirectory(dir=SOURCE.parent) as temporary:
                    archive = pathlib.Path(temporary) / 'api.tar.gz'
                    digest = archive_at(archive, [name], link=link)
                    with self.assertRaises(ValueError):
                        STAGE.inspect_archive(archive, digest)


if __name__ == '__main__':
    unittest.main()
