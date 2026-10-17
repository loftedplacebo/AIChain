#!/usr/bin/env python3
"""Replace an inactive Production worker release with exact rollback retained."""

import argparse
import hashlib
import importlib.util
import json
import os
import pathlib
import shutil
import stat
import subprocess
import tarfile

from production_worker_registry import load_registry


SOURCE = pathlib.Path(__file__).with_name('stage-production-worker-release.py')
SPEC = importlib.util.spec_from_file_location('production_worker_stage', SOURCE)
STAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STAGE)
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-worker')
PINS = {
    '76a89ae1b6ffca41c8a0b0ed6d9a834a67e19371':
        '11deabf3d1604edf6c18c6523b951ec9102b954848f4e7261e630d99883792c5',
    'fa2b929e05f0a3069054b935e0c0aa28e2ba860f':
        '7c2f8cb49a8f62df43fac38f76e7a70bda14cdcb5bab61e6051ceadcf1ba549a',
    'ba47cb8140c7ea7ecb12e57bd52c52007f6a43d2':
        '382b1987af4e15300ae40b7078f26086d5901b4f5e4b2a4edfa081b3eaf8635f',
}


def offline():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = STAGE.UNIT.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or \
            hashlib.sha256(STAGE.UNIT.read_bytes()).hexdigest() != STAGE.UNIT_SHA256:
        raise ValueError('Reviewed Production worker template required')
    enabled = subprocess.run(('systemctl', 'is-enabled', STAGE.UNIT.name),
                             capture_output=True, text=True, timeout=15,
                             check=False)
    instances = subprocess.run(('systemctl', 'list-units', '--all', '--plain',
                                '--no-legend',
                                'orvessian-production-project-worker@*.service'),
                               capture_output=True, text=True, timeout=15,
                               check=False)
    if enabled.stdout.strip() != 'disabled' or instances.returncode or \
            instances.stdout.strip():
        raise ValueError('Production worker unit must be disabled with no instances')
    _, workers = load_registry()
    if workers:
        raise ValueError('Production worker inventory must be empty for replacement')


def manifest(directory, commit):
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Protected Production worker release required')
    record = directory / 'PRODUCTION-WORKER-RELEASE.json'
    details = STAGE.protected_file(record, 1024)
    value = json.loads(details.read_text(encoding='ascii'))
    if not isinstance(value, dict) or set(value) != {
            'sourceCommit', 'archiveSha256', 'serviceTemplate', 'activation'} or \
            value['sourceCommit'] != commit or value['archiveSha256'] != PINS.get(commit) or \
            value['serviceTemplate'] != STAGE.UNIT.name or \
            value['activation'] != 'disabled':
        raise ValueError('Pinned Production worker release identity mismatch')
    return value


def successor(archive, digest, commit):
    staged = RELEASE.with_name(RELEASE.name + '.next-' + commit[:12])
    if staged.exists() or staged.is_symlink():
        raise ValueError('Prior Production worker staging path needs review')
    staged.mkdir(mode=0o755)
    try:
        with tarfile.open(archive, 'r:gz') as package:
            for item in package:
                target = staged.joinpath(*pathlib.PurePosixPath(item.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with package.extractfile(item) as reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
        record = staged / 'PRODUCTION-WORKER-RELEASE.json'
        record.write_text(json.dumps({
            'sourceCommit': commit, 'archiveSha256': digest,
            'serviceTemplate': STAGE.UNIT.name, 'activation': 'disabled',
        }, sort_keys=True) + '\n', encoding='ascii')
        record.chmod(0o644)
        return staged
    except Exception:
        shutil.rmtree(staged)
        raise


def replace(archive, digest, commit, previous):
    backup = RELEASE.with_name(RELEASE.name + '.previous-' + previous[:12])
    if backup.exists() or backup.is_symlink():
        raise ValueError('Prior rollback release needs review')
    staged = successor(archive, digest, commit)
    try:
        RELEASE.rename(backup)
        try:
            staged.rename(RELEASE)
        except OSError:
            backup.rename(RELEASE)
            raise
    finally:
        if staged.exists():
            shutil.rmtree(staged)
    offline()
    manifest(RELEASE, commit)
    manifest(backup, previous)
    print('production_worker_release=replaced;commit=' + commit[:12] +
          ';rollback=' + previous[:12] + ';service=off')


def rollback(current, previous):
    backup = RELEASE.with_name(RELEASE.name + '.previous-' + previous[:12])
    manifest(backup, previous)
    reverted = RELEASE.with_name(RELEASE.name + '.reverted-' + current[:12])
    if reverted.exists() or reverted.is_symlink():
        raise ValueError('Prior reverted Production worker release needs review')
    RELEASE.rename(reverted)
    try:
        backup.rename(RELEASE)
    except OSError:
        reverted.rename(RELEASE)
        raise
    offline()
    print('production_worker_release=rolled_back;commit=' + previous[:12] +
          ';reverted=' + current[:12] + ';service=off')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path)
    parser.add_argument('--sha256')
    parser.add_argument('--commit', required=True)
    parser.add_argument('--previous', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    if args.commit not in PINS or args.previous not in PINS or \
            args.commit == args.previous:
        raise ValueError('Distinct pinned Production worker commits required')
    offline()
    manifest(RELEASE, args.commit if args.rollback else args.previous)
    if args.rollback:
        if args.archive or args.sha256:
            raise ValueError('Rollback does not take an archive')
        manifest(RELEASE.with_name(RELEASE.name + '.previous-' +
                                   args.previous[:12]), args.previous)
        if args.apply:
            rollback(args.commit, args.previous)
        else:
            print('production_worker_release=rollback_ready;mode=read-only')
        return
    if not args.archive or args.sha256 != PINS[args.commit]:
        raise ValueError('Exact pinned successor archive required')
    count = STAGE.inspect_archive(args.archive, args.sha256)
    if args.apply:
        replace(args.archive, args.sha256, args.commit, args.previous)
    else:
        print(json.dumps({'productionWorkerRelease': 'replace_ready',
                          'archiveMembers': count,
                          'currentCommit': args.previous,
                          'nextCommit': args.commit,
                          'service': 'disabled'}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError,
            tarfile.TarError, subprocess.TimeoutExpired):
        raise SystemExit('Production worker release replacement failed; '
                         'inspect inactive state') from None
