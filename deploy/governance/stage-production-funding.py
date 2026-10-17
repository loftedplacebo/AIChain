#!/usr/bin/env python3
"""Stage the root-only Production relayer funding operator; never sign or send."""

import argparse
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import tarfile


RELEASE = pathlib.Path('/opt/aichain/orvessian-production-funding')
REQUIRED = {
    'scripts/fund-production-relayer.cjs',
    'scripts/fund-production-relayer.test.cjs',
    'deploy/governance/production-funding.sh',
}
DIRECTORIES = {'deploy/', 'deploy/governance/', 'scripts/'}
ETHERS = pathlib.Path('/opt/aichain/orvessian-production-api/node_modules/ethers/package.json')


def inspect(archive, digest, commit):
    if os.geteuid() != 0 or not archive.is_absolute() or \
            not re.fullmatch(r'[a-f0-9]{64}', digest) or \
            not re.fullmatch(r'[a-f0-9]{40}', commit):
        raise ValueError('Root, exact commit and reviewed archive required')
    info = archive.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or not 1 <= info.st_size <= 1048576 or \
            hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
        raise ValueError('Protected funding archive SHA-256 mismatch')
    if RELEASE.exists() or RELEASE.is_symlink() or not ETHERS.is_file():
        raise ValueError('Existing funding release or missing pinned dependency')
    with tarfile.open(archive, 'r:') as source:
        members = source.getmembers()
        files = [item for item in members if item.isfile()]
        directories = [item for item in members if item.isdir()]
        if {item.name for item in files} != REQUIRED or \
                len(files) != len(REQUIRED) or \
                not {item.name.rstrip('/') + '/' for item in directories}.issubset(DIRECTORIES) or \
                len(files) + len(directories) != len(members) or any(
                item.size < 1 or item.size > 131072 or
                pathlib.PurePosixPath(item.name).is_absolute() or
                '..' in pathlib.PurePosixPath(item.name).parts
                for item in files):
            raise ValueError('Exact root-only funding archive members required')
    return len(files)


def stage(archive, digest, commit):
    temporary = RELEASE.with_name(RELEASE.name + '.stage-' + commit[:12])
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Funding staging path needs review')
    temporary.mkdir(mode=0o700)
    try:
        with tarfile.open(archive, 'r:') as source:
            for item in source:
                if item.isdir():
                    continue
                target = temporary.joinpath(*pathlib.PurePosixPath(item.name).parts)
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                with source.extractfile(item) as reader, target.open('xb') as writer:
                    contents = reader.read()
                    if item.name.endswith('.sh'):
                        contents = contents.replace(b'\r\n', b'\n')
                    writer.write(contents)
                target.chmod(0o700 if item.name.endswith('.sh') else 0o600)
        manifest = temporary / 'PRODUCTION-FUNDING-RELEASE.json'
        manifest.write_text(json.dumps({'sourceCommit': commit,
                                        'archiveSha256': digest,
                                        'activation': 'operator-only'},
                                       sort_keys=True) + '\n', encoding='utf-8')
        manifest.chmod(0o600)
        temporary.rename(RELEASE)
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)
    print('production_funding=staged;transactions=none;wallet_key=unread')


def repair_shell(archive, digest, commit):
    """Normalize the exact staged source wrapper after an older CRLF install."""
    archive_info = archive.lstat()
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9]{64}', digest) or \
            not re.fullmatch(r'[a-f0-9]{40}', commit) or \
            not archive.is_absolute() or not stat.S_ISREG(archive_info.st_mode) or \
            archive_info.st_uid != 0 or archive_info.st_mode & 0o022 or \
            not 1 <= archive_info.st_size <= 1048576 or \
            hashlib.sha256(archive.read_bytes()).hexdigest() != digest:
        raise ValueError('Reviewed archive required')
    manifest = RELEASE / 'PRODUCTION-FUNDING-RELEASE.json'
    target = RELEASE / 'deploy/governance/production-funding.sh'
    if RELEASE.is_symlink() or manifest.is_symlink() or target.is_symlink() or \
            not manifest.is_file() or not target.is_file() or \
            manifest.stat().st_uid != 0 or target.stat().st_uid != 0 or \
            target.stat().st_mode & 0o777 != 0o700:
        raise ValueError('Protected funding release required')
    expected_manifest = {'sourceCommit': commit, 'archiveSha256': digest,
                         'activation': 'operator-only'}
    if json.loads(manifest.read_text(encoding='utf-8')) != expected_manifest:
        raise ValueError('Funding release manifest mismatch')
    with tarfile.open(archive, 'r:') as source:
        original = source.extractfile('deploy/governance/production-funding.sh').read()
    normalized = original.replace(b'\r\n', b'\n')
    if target.read_bytes() not in (original, normalized):
        raise ValueError('Funding wrapper differs from reviewed archive')
    if target.read_bytes() != normalized:
        temporary = target.with_name(target.name + '.normalized')
        with temporary.open('xb') as output:
            output.write(normalized)
        temporary.chmod(0o700)
        temporary.replace(target)
    print('production_funding_wrapper=normalized;transactions=none;wallet_key=unread')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--repair-shell', action='store_true')
    args = parser.parse_args()
    if args.repair_shell:
        repair_shell(args.archive, args.sha256, args.commit)
        return
    count = inspect(args.archive, args.sha256, args.commit)
    if args.apply:
        stage(args.archive, args.sha256, args.commit)
    else:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'archiveMembers': count, 'transactions': 0},
                         sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, tarfile.TarError):
        raise SystemExit('Production funding staging failed; no wallet key read or transaction sent') from None
