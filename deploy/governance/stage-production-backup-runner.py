#!/usr/bin/env python3
"""Stage a pinned production backup runner without activating a service."""

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import stat
import tarfile
import tempfile


ARCHIVE = pathlib.Path('/opt/aichain/releases/08774a1-production-backup-api.tar.gz')
DESTINATION = pathlib.Path('/opt/aichain/orvessian-production-backup-runner')
COMMIT = '08774a1'
DIGEST = '8a37344bbf8aa09e893f4886710b9d4d921af0a88454a1af3006e65735445fd4'
REQUIRED = {
    'scripts/governance-postgres-recovery.cjs',
    'scripts/governance-backup-object-storage.cjs',
    'services/governance/postgres-backup.cjs',
    'services/governance/backup-object-storage.cjs',
    'node_modules/pg/package.json',
    'node_modules/@aws-sdk/client-s3/package.json',
}
ROOTS = {'scripts', 'services', 'sdk', 'node_modules'}


def inspect():
    archive = ARCHIVE.lstat()
    if not stat.S_ISREG(archive.st_mode) or archive.st_uid != 0 or \
            archive.st_mode & 0o022 or archive.st_size > 80_000_000:
        raise ValueError('Protected pinned archive required')
    if hashlib.sha256(ARCHIVE.read_bytes()).hexdigest() != DIGEST:
        raise ValueError('Production backup archive hash mismatch')
    if DESTINATION.exists() or DESTINATION.is_symlink():
        raise ValueError('Production backup runner already exists')
    members = []
    total = 0
    with tarfile.open(ARCHIVE, 'r:gz') as package:
        for member in package:
            name = pathlib.PurePosixPath(member.name)
            if not member.isfile() or name.is_absolute() or not name.parts or \
                    name.parts[0] not in ROOTS or any(part in ('', '.', '..') for part in name.parts) or \
                    member.size < 0 or member.size > 20_000_000:
                raise ValueError('Unexpected production backup archive member')
            total += member.size
            if len(members) >= 10_000 or total > 200_000_000:
                raise ValueError('Production backup archive exceeds limits')
            members.append(member.name)
    if len(members) != len(set(members)) or not REQUIRED.issubset(members):
        raise ValueError('Production backup archive contents incomplete')
    return len(members)


def stage():
    temporary = pathlib.Path(tempfile.mkdtemp(prefix='.production-backup-runner-',
                                               dir=DESTINATION.parent))
    try:
        with tarfile.open(ARCHIVE, 'r:gz') as package:
            for member in package:
                target = temporary.joinpath(*pathlib.PurePosixPath(member.name).parts)
                target.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
                with package.extractfile(member) as source, target.open('xb') as output:
                    shutil.copyfileobj(source, output)
                target.chmod(0o644)
        manifest = temporary / 'PRODUCTION-BACKUP-RELEASE.json'
        manifest.write_text(json.dumps({'sourceCommit': COMMIT, 'archiveSha256': DIGEST,
                                        'service': 'none', 'scope': 'offline-backup-runner'},
                                       sort_keys=True) + '\n', encoding='ascii')
        manifest.chmod(0o644)
        os.replace(temporary, DESTINATION)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Root required')
    count = inspect()
    if args.apply:
        stage()
        print(f'production_backup_runner=staged;members={count};service=none')
    else:
        print(f'production_backup_runner=ready;members={count};mode=read-only')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, tarfile.TarError):
        raise SystemExit('Production backup runner staging failed; no service activated') from None
