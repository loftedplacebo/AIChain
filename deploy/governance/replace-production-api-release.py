#!/usr/bin/env python3
"""Replace an inactive production API release and retain an exact rollback."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import shutil
import stat
import tarfile


SOURCE = pathlib.Path(__file__).with_name('stage-production-api-release.py')
SPEC = importlib.util.spec_from_file_location('production_api_stage', SOURCE)
STAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(STAGE)
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api')


def manifest(directory, commit):
    info = directory.lstat()
    if not stat.S_ISDIR(info.st_mode) or (os.name == 'posix' and
                                           (info.st_uid != 0 or info.st_mode & 0o022)):
        raise ValueError('Protected production release directory required')
    record = directory / 'PRODUCTION-RELEASE.json'
    details = record.lstat()
    if not stat.S_ISREG(details.st_mode) or \
            (os.name == 'posix' and (details.st_uid != 0 or details.st_mode & 0o022)) or \
            details.st_size > 1024:
        raise ValueError('Protected production release manifest required')
    value = json.loads(record.read_text(encoding='utf-8'))
    if not isinstance(value, dict) or set(value) != {
            'sourceCommit', 'archiveSha256', 'service', 'activation'} or \
            value['sourceCommit'] != commit or \
            not re.fullmatch(r'[a-f0-9]{64}', value['archiveSha256']) or \
            value['service'] != STAGE.UNIT or value['activation'] != 'disabled':
        raise ValueError('Production release identity mismatch')
    return value


def successor(archive, digest, commit):
    staged = RELEASE.with_name(RELEASE.name + '.next-' + commit[:12])
    if staged.exists() or staged.is_symlink():
        raise ValueError('Prior staging path requires review')
    staged.mkdir(mode=0o755)
    try:
        with tarfile.open(archive, 'r:gz') as source:
            for item in source:
                target = staged.joinpath(*pathlib.PurePosixPath(item.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                with source.extractfile(item) as reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
        record = staged / 'PRODUCTION-RELEASE.json'
        record.write_text(json.dumps({'sourceCommit': commit,
                                      'archiveSha256': digest,
                                      'service': STAGE.UNIT,
                                      'activation': 'disabled'},
                                     sort_keys=True) + '\n', encoding='utf-8')
        record.chmod(0o644)
        return staged
    except Exception:
        shutil.rmtree(staged)
        raise


def replace(archive, digest, commit, previous):
    STAGE.inspect_archive(archive, digest)
    STAGE.check_unit()
    manifest(RELEASE, previous)
    backup = RELEASE.with_name(RELEASE.name + '.previous-' + previous[:12])
    if backup.exists() or backup.is_symlink() or commit == previous:
        raise ValueError('Distinct release and empty rollback path required')
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
    STAGE.check_unit()
    manifest(RELEASE, commit)
    print('production_api_release=replaced;commit=' + commit[:12] +
          ';rollback=' + previous[:12] + ';service=off')


def rollback(current, previous):
    STAGE.check_unit()
    manifest(RELEASE, current)
    backup = RELEASE.with_name(RELEASE.name + '.previous-' + previous[:12])
    manifest(backup, previous)
    failed = RELEASE.with_name(RELEASE.name + '.reverted-' + current[:12])
    if failed.exists() or failed.is_symlink():
        raise ValueError('Prior reverted path requires review')
    RELEASE.rename(failed)
    try:
        backup.rename(RELEASE)
    except OSError:
        failed.rename(RELEASE)
        raise
    STAGE.check_unit()
    print('production_api_release=rolled_back;commit=' + previous[:12] +
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
    if os.geteuid() != 0 or args.commit == args.previous or \
            not all(re.fullmatch(r'[a-f0-9]{40}', ref)
                    for ref in (args.commit, args.previous)):
        raise ValueError('Root and distinct exact source commits required')
    if args.rollback:
        if args.archive or args.sha256:
            raise ValueError('Rollback does not take an archive')
        STAGE.check_unit()
        manifest(RELEASE, args.commit)
        backup = RELEASE.with_name(RELEASE.name + '.previous-' + args.previous[:12])
        manifest(backup, args.previous)
        if args.apply:
            rollback(args.commit, args.previous)
        else:
            print(json.dumps({'ready': True, 'mode': 'read-only',
                              'currentCommit': args.commit,
                              'rollbackCommit': args.previous,
                              'service': 'disabled'}, sort_keys=True))
        return
    if not args.archive or not args.sha256:
        raise ValueError('Reviewed archive and hash required')
    count = STAGE.inspect_archive(args.archive, args.sha256)
    STAGE.check_unit()
    manifest(RELEASE, args.previous)
    if args.apply:
        replace(args.archive, args.sha256, args.commit, args.previous)
    else:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'archiveMembers': count, 'currentCommit': args.previous,
                          'nextCommit': args.commit, 'service': 'disabled'},
                         sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            tarfile.TarError):
        raise SystemExit('Production API release replacement failed; inspect inactive state') from None
