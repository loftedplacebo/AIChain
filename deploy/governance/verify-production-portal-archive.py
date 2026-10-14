#!/usr/bin/env python3
"""Verify the pinned Production portal archive before extraction or rollback."""

import hashlib
import os
import pathlib
import posixpath
import stat
import tarfile


ARCHIVE = pathlib.Path('/opt/aichain/releases/3da61c6-production-portal.tar.gz')
DIGEST = '55ca21e645dcaa670d25047338e0fbab0cc966613e89ace94e019b52c4cabfad'
ROOTS = {'dist', 'node_modules', 'public', 'server.js', 'package.json'}


def verify(path=ARCHIVE):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or (os.name == 'posix' and
            (info.st_uid != 0 or info.st_mode & 0o022)) or info.st_size > 250_000_000:
        raise ValueError('Protected pinned Production portal archive required')
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != DIGEST:
        raise ValueError('Production portal archive hash mismatch')
    names = set()
    files = set()
    symlinks = 0
    total = 0
    with tarfile.open(path, 'r:gz') as package:
        for member in package:
            name = member.name.rstrip('/')
            parts = pathlib.PurePosixPath(name).parts
            if not name or name.startswith('/') or not parts or \
                    parts[0] not in ROOTS or any(part in ('', '.', '..') for part in parts) or \
                    name in names:
                raise ValueError('Unexpected Production portal archive path')
            names.add(name)
            if member.isfile():
                total += member.size
                files.add(name)
            elif member.issym():
                symlinks += 1
                link = member.linkname
                target = posixpath.normpath(posixpath.join(posixpath.dirname(name), link))
                if not link or link.startswith('/') or target == '..' or \
                        target.startswith('../') or not target.startswith('node_modules/'):
                    raise ValueError('Production portal archive link escapes package')
            elif not member.isdir():
                raise ValueError('Unsupported Production portal archive member')
            if len(names) > 30_000 or total > 800_000_000:
                raise ValueError('Production portal archive exceeds limits')
    required = {'server.js', 'package.json', 'dist/server/index.js',
                'node_modules/vinext/package.json'}
    if not required.issubset(files) or 'public' not in names:
        raise ValueError('Production portal archive contents incomplete')
    return len(names), symlinks, total


if __name__ == '__main__':
    try:
        count, links, total = verify()
        print(f'production_portal_archive=verified;members={count};'
              f'links={links};unpacked_bytes={total}')
    except (OSError, ValueError, tarfile.TarError):
        raise SystemExit('Production portal archive verification failed') from None
