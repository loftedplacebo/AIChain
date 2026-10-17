"""Synthetic root-only funding release staging without a wallet or RPC."""

import hashlib
import importlib.util
import io
import pathlib
import tarfile
import tempfile
import unittest
from unittest import mock


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'stage_production_funding', HERE / 'stage-production-funding.py')
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)
COMMIT = 'a' * 40


class FundingStageTests(unittest.TestCase):
    def test_exact_archive_stages_root_only_without_activation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            archive = root / 'funding.tar'
            with tarfile.open(archive, 'w:') as output:
                for name in MODULE.DIRECTORIES:
                    directory = tarfile.TarInfo(name)
                    directory.type = tarfile.DIRTYPE
                    output.addfile(directory)
                for name in MODULE.REQUIRED:
                    content = b'example source\n'
                    info = tarfile.TarInfo(name)
                    info.size = len(content)
                    output.addfile(info, io.BytesIO(content))
            digest = hashlib.sha256(archive.read_bytes()).hexdigest()
            dependency = root / 'ethers.json'
            dependency.write_text('{}')
            release = root / 'funding-release'
            with mock.patch.object(MODULE, 'RELEASE', release), \
                    mock.patch.object(MODULE, 'ETHERS', dependency):
                self.assertEqual(MODULE.inspect(archive, digest, COMMIT), 3)
                MODULE.stage(archive, digest, COMMIT)
                self.assertEqual((release / 'scripts/fund-production-relayer.cjs').stat().st_mode & 0o777, 0o600)
                self.assertEqual((release / 'deploy/governance/production-funding.sh').stat().st_mode & 0o777, 0o700)
                self.assertEqual((release / 'PRODUCTION-FUNDING-RELEASE.json').stat().st_mode & 0o777, 0o600)

    def test_modified_or_extra_archive_is_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            archive = root / 'funding.tar'
            with tarfile.open(archive, 'w:') as output:
                content = b'unexpected\n'
                info = tarfile.TarInfo('private.key')
                info.size = len(content)
                output.addfile(info, io.BytesIO(content))
            dependency = root / 'ethers.json'
            dependency.write_text('{}')
            with mock.patch.object(MODULE, 'RELEASE', root / 'release'), \
                    mock.patch.object(MODULE, 'ETHERS', dependency):
                digest = hashlib.sha256(archive.read_bytes()).hexdigest()
                with self.assertRaisesRegex(ValueError, 'Exact root-only'):
                    MODULE.inspect(archive, digest, COMMIT)
                with self.assertRaisesRegex(ValueError, 'SHA-256'):
                    MODULE.inspect(archive, '0' * 64, COMMIT)


if __name__ == '__main__':
    unittest.main()
