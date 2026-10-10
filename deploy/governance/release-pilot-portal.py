#!/usr/bin/env python3
"""Activate a checksum-pinned standalone pilot portal archive, with rollback.

The archive is staged and checked before the live directory is moved. A failed
restart or loopback check restores the prior directory and restarts its unit.
"""
import argparse
import hashlib
import os
import pathlib
import re
import shutil
import stat
import subprocess
import tarfile
import time
from urllib.request import ProxyHandler, Request, build_opener

BASE = pathlib.Path('/opt/aichain')
CURRENT = BASE / 'orvessian-pilot-portal'
RELEASES = BASE / 'orvessian-pilot-portal-releases'
LOCK = BASE / '.orvessian-pilot-portal-release.lock'
UNIT = 'orvessian-pilot-portal.service'
MAX_ARCHIVE_BYTES = 2 * 1024 ** 3
MAX_MEMBERS = 100000
MAX_UNPACKED_BYTES = 4 * 1024 ** 3


def release_paths(release_id):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', release_id):
        raise ValueError('Invalid release ID')
    return tuple(RELEASES / (release_id + suffix)
                 for suffix in ('.stage', '.previous', '.failed'))


def verify_archive(archive, digest):
    if not archive.is_absolute() or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Absolute archive and SHA-256 required')
    info = archive.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            not 1 <= info.st_size <= MAX_ARCHIVE_BYTES:
        raise ValueError('Root-owned archive within size limit required')
    checksum = hashlib.sha256()
    with archive.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
    if checksum.hexdigest() != digest:
        raise ValueError('Archive SHA-256 mismatch')


def unpack_archive(archive, stage):
    stage.mkdir(mode=0o755)
    with tarfile.open(archive, 'r:gz') as source:
        members = source.getmembers()
        if len(members) > MAX_MEMBERS or \
                sum(member.size for member in members) > MAX_UNPACKED_BYTES:
            raise ValueError('Archive member limit exceeded')
        for member in members:
            name = pathlib.PurePosixPath(member.name)
            if name.is_absolute() or '..' in name.parts or \
                    not (member.isdir() or member.isfile()):
                raise ValueError('Archive contains unsafe entry')
            if name.parts in ((), ('.',)):
                continue
            target = stage.joinpath(*name.parts)
            if member.isdir():
                target.mkdir(parents=True, exist_ok=True, mode=0o755)
            else:
                target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
                if target.exists() or target.is_symlink():
                    raise ValueError('Duplicate archive entry')
                reader = source.extractfile(member)
                if reader is None:
                    raise ValueError('Archive file unavailable')
                with reader, target.open('xb') as writer:
                    shutil.copyfileobj(reader, writer)
                target.chmod(0o644)
    if not (stage / 'server.js').is_file() or \
            not (stage / 'dist').is_dir() or \
            not (stage / 'node_modules').is_dir():
        raise ValueError('Standalone portal archive incomplete')


def restart_and_check():
    opener = build_opener(ProxyHandler({}))
    if subprocess.run(('systemctl', 'restart', UNIT), check=False).returncode:
        return False
    for _ in range(15):
        active = subprocess.run(('systemctl', 'is-active', '--quiet', UNIT),
                                check=False).returncode == 0
        if active:
            try:
                request = Request(
                    'http://127.0.0.1:3002/workspace',
                    headers={'Host': 'portal.orvessian.com'})
                with opener.open(request, timeout=2) as response:
                    if response.status == 200:
                        return True
            except (OSError, ValueError):
                pass
        time.sleep(1)
    return False


def activate(archive, digest, release_id):
    stage, previous, failed = release_paths(release_id)
    if not CURRENT.is_dir() or any(path.exists() for path in
                                   (stage, previous, failed)):
        raise ValueError('Current directory and unused release ID required')
    verify_archive(archive, digest)
    try:
        unpack_archive(archive, stage)
        CURRENT.rename(previous)
        try:
            stage.rename(CURRENT)
        except OSError:
            previous.rename(CURRENT)
            raise
        if not restart_and_check():
            CURRENT.rename(failed)
            previous.rename(CURRENT)
            if not restart_and_check():
                raise RuntimeError('Portal rollback failed health check')
            raise RuntimeError('Portal activation failed; prior build restored')
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    print('pilot_portal_release=active;release_id=' + release_id)


def rollback(release_id):
    stage, previous, failed = release_paths(release_id)
    if not CURRENT.is_dir() or not previous.is_dir() or \
            stage.exists() or failed.exists():
        raise ValueError('Active release and its previous build required')
    CURRENT.rename(failed)
    try:
        previous.rename(CURRENT)
        if not restart_and_check():
            raise RuntimeError('Previous build failed health check')
    except (OSError, RuntimeError):
        if CURRENT.exists():
            CURRENT.rename(previous)
        failed.rename(CURRENT)
        restart_and_check()
        raise
    print('pilot_portal_release=rolled_back;release_id=' + release_id)


def main():
    import fcntl
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    deploy = sub.add_parser('activate')
    deploy.add_argument('--archive', type=pathlib.Path, required=True)
    deploy.add_argument('--sha256', required=True)
    deploy.add_argument('--release-id', required=True)
    undo = sub.add_parser('rollback')
    undo.add_argument('--release-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Root required')
    RELEASES.mkdir(mode=0o755, exist_ok=True)
    with LOCK.open('a') as stream:
        fcntl.flock(stream, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if args.command == 'activate':
            activate(args.archive, args.sha256, args.release_id)
        else:
            rollback(args.release_id)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, tarfile.TarError,
            BlockingIOError) as error:
        print('pilot_portal_release=failed;reason=' + type(error).__name__)
        raise SystemExit(1) from None
