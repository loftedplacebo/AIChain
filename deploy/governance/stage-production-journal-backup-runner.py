#!/usr/bin/env python3
"""Stage the journal-aware Production recovery code beside the live runner.

The live prelaunch backup timer and its pinned runner are never changed here.
"""

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import stat
import tempfile


BASE = pathlib.Path('/opt/aichain/orvessian-production-backup-runner-8285df6')
OVERLAY = pathlib.Path('/opt/aichain/releases/production-journal-backup-core-61a063e')
DESTINATION = pathlib.Path('/opt/aichain/orvessian-production-journal-backup-runner-61a063e')
BASE_MANIFEST = {
    'archiveSha256': '1eb935f47e01d1d84802543bfe254157df0246927f22a6b4681427ea91a737ae',
    'scope': 'offline-backup-runner', 'service': 'none', 'sourceCommit': '8285df6',
}
OLD_CORE = {
    'services/governance/postgres-backup.cjs':
        'b2bfc131fd926dc0c53545e79c62e53ea13b7fcf8f661503d5a0db72f846599b',
    'services/governance/recovery.cjs':
        'ab4c5445e91136853dab33bbf04aefb0f467ac10d9152bb3b07b135285f69c61',
}
NEW_CORE = {
    'services/governance/postgres-backup.cjs':
        '7a52e242cedb0084fda90ce5f2226cf3d165a1e3606c18bc883f1c7a20086d51',
    'services/governance/recovery.cjs':
        'f999170605b070c2567d5920b3309901163b14f3715dd0bfd4ed2b54ab49514f',
}
REQUIRED = (
    'scripts/governance-postgres-recovery.cjs',
    'scripts/governance-backup-object-storage.cjs',
    'services/governance/backup-object-storage.cjs',
    'node_modules/pg/package.json',
    'node_modules/@aws-sdk/client-s3/package.json',
)


def protected_file(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Protected regular release file required')
    return path


def digest(path):
    return hashlib.sha256(protected_file(path).read_bytes()).hexdigest()


def inspect():
    base = BASE.lstat()
    if not stat.S_ISDIR(base.st_mode) or base.st_uid != 0 or base.st_mode & 0o077:
        raise ValueError('Protected base runner required')
    if DESTINATION.exists() or DESTINATION.is_symlink():
        raise ValueError('Journal backup runner already exists')
    if json.loads(protected_file(BASE / 'PRODUCTION-BACKUP-RELEASE.json').read_text()) != BASE_MANIFEST:
        raise ValueError('Pinned base runner manifest mismatch')
    for name in REQUIRED:
        protected_file(BASE / name)
    for name in NEW_CORE:
        if digest(BASE / name) != OLD_CORE[name] or digest(OVERLAY / name) != NEW_CORE[name]:
            raise ValueError('Production journal core hash mismatch')
    for root, dirs, files in os.walk(BASE, followlinks=False):
        for name in dirs + files:
            path = pathlib.Path(root) / name
            if path.is_symlink():
                raise ValueError('Symlink in pinned base runner')
    return len(NEW_CORE)


def stage():
    temporary = pathlib.Path(tempfile.mkdtemp(
        prefix='.production-journal-backup-runner-', dir=DESTINATION.parent))
    try:
        shutil.copytree(BASE, temporary, dirs_exist_ok=True, symlinks=False)
        for name in NEW_CORE:
            target = temporary / name
            shutil.copyfile(OVERLAY / name, target)
            target.chmod(0o644)
            if hashlib.sha256(target.read_bytes()).hexdigest() != NEW_CORE[name]:
                raise ValueError('Staged journal core hash mismatch')
        manifest = temporary / 'PRODUCTION-JOURNAL-BACKUP-RELEASE.json'
        manifest.write_text(json.dumps({
            'baseCommit': BASE_MANIFEST['sourceCommit'],
            'baseArchiveSha256': BASE_MANIFEST['archiveSha256'],
            'journalCoreCommit': '61a063e', 'coreSha256': NEW_CORE,
            'scope': 'offline-journal-backup-runner', 'service': 'none',
        }, sort_keys=True) + '\n', encoding='ascii')
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
        print(f'production_journal_backup_runner=staged;core_files={count};service=none')
    else:
        print(f'production_journal_backup_runner=ready;core_files={count};mode=read-only')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        raise SystemExit('Production journal runner staging failed; no service activated') from None
