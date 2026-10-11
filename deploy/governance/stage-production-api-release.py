#!/usr/bin/env python3
"""Stage a reviewed production API archive without starting its service."""

import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tarfile


RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api')
UNIT = 'orvessian-production-api.service'
REQUIRED = {
    'scripts/governance-production-api.cjs',
    'services/governance/start.cjs',
    'node_modules/pg/package.json',
    'node_modules/ethers/package.json',
    'node_modules/jose/package.json',
}
ROOTS = {'scripts', 'services', 'sdk', 'node_modules'}
MAX_ARCHIVE_BYTES = 200 * 1024 * 1024
MAX_UNPACKED_BYTES = 500 * 1024 * 1024
MAX_MEMBERS = 100000


def inspect_archive(archive, digest):
    if not archive.is_absolute() or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Absolute archive and SHA-256 required')
    info = archive.lstat()
    if not stat.S_ISREG(info.st_mode) or (os.name == 'posix' and
                                           (info.st_uid != 0 or info.st_mode & 0o022)) or \
            not 1 <= info.st_size <= MAX_ARCHIVE_BYTES:
        raise ValueError('Root-owned reviewed archive required')
    calculated = hashlib.sha256(archive.read_bytes()).hexdigest()
    if calculated != digest:
        raise ValueError('Archive SHA-256 mismatch')
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > MAX_MEMBERS or sum(item.size for item in members) > MAX_UNPACKED_BYTES:
            raise ValueError('Archive limits exceeded')
        seen = set()
        for item in members:
            name = pathlib.PurePosixPath(item.name)
            if not item.isfile() or name.is_absolute() or len(name.parts) < 2 or \
                    '..' in name.parts or name.parts[0] not in ROOTS or \
                    name.suffix.lower() in ('.env', '.pem', '.key'):
                raise ValueError('Unsafe production archive member')
            if item.name in seen:
                raise ValueError('Duplicate production archive member')
            seen.add(item.name)
        if not REQUIRED.issubset(seen):
            raise ValueError('Production API entrypoint or dependencies missing')
    return len(members)


def check_unit():
    result = subprocess.run(('systemctl', 'show', UNIT, '-p', 'UnitFileState',
                             '-p', 'ActiveState'), text=True, capture_output=True,
                            timeout=15, check=False)
    if result.returncode or set(result.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API unit must remain disabled and inactive')


def check_release():
    info = RELEASE.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or \
            any(RELEASE.iterdir()):
        raise ValueError('Empty root-owned production release directory required')


def stage(archive, digest, commit):
    suffix = commit[:12]
    temporary = RELEASE.with_name(RELEASE.name + '.stage-' + suffix)
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Prior production staging path needs review')
    temporary.mkdir(mode=0o755)
    try:
        with tarfile.open(archive, 'r:gz') as source:
            for item in source:
                target = temporary.joinpath(*pathlib.PurePosixPath(item.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(item) as reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
        manifest = {'sourceCommit': commit, 'archiveSha256': digest,
                    'service': UNIT, 'activation': 'disabled'}
        (temporary / 'PRODUCTION-RELEASE.json').write_text(
            json.dumps(manifest, sort_keys=True) + '\n', encoding='utf-8')
        (temporary / 'PRODUCTION-RELEASE.json').chmod(0o644)
        RELEASE.rmdir()
        try:
            temporary.rename(RELEASE)
        except OSError:
            RELEASE.mkdir(mode=0o755)
            raise
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    check_unit()
    print('production_api_release=staged;commit=' + commit[:12] +
          ';service=inactive;public_route=unchanged')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9]{40}', args.commit):
        raise ValueError('Root and exact source commit required')
    count = inspect_archive(args.archive, args.sha256)
    check_unit()
    check_release()
    if not args.apply:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'archiveMembers': count, 'sourceCommit': args.commit,
                          'service': 'disabled'}, sort_keys=True))
        return
    stage(args.archive, args.sha256, args.commit)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, tarfile.TarError, subprocess.TimeoutExpired):
        raise SystemExit('Production API release staging failed; inspect partial state') from None
