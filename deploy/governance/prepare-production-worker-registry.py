#!/usr/bin/env python3
"""Create the empty, locked Production worker inventory while admission is closed."""

import fcntl
import importlib.util
import json
import os
import pathlib
import stat
import sys

from production_worker_registry import LOCK, REGISTRY, load_registry, validate_registry


SCHEMA = pathlib.Path('/opt/aichain/governance-pilot-db-setup/apply-production-schema.py')
EMPTY = {'version': 1, 'environment': 'prod', 'chain': None, 'workers': []}


def preflight():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    parent = REGISTRY.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or \
            stat.S_IMODE(parent.st_mode) != 0o700:
        raise ValueError('Protected Production configuration directory required')
    spec = importlib.util.spec_from_file_location('production_schema', SCHEMA)
    schema = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(schema)
    admin = schema.protected(schema.ADMIN, 1025)
    if schema.psql('doadmin', admin, 'SELECT name FROM governance_environment;') != 'prod' or \
            schema.psql('doadmin', admin,
                        'SELECT count(*) FROM governance_customer_projects;') != '0':
        raise ValueError('Empty Production database required')
    validate_registry(EMPTY)


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise ValueError('Usage: prepare-production-worker-registry.py [--apply]')
    preflight()
    if not sys.argv[1:]:
        if REGISTRY.exists() or REGISTRY.is_symlink():
            document, workers = load_registry()
            if document != EMPTY or workers:
                raise ValueError('Existing Production worker inventory needs review')
            status = 'already_empty'
        else:
            status = 'ready'
        print('production_worker_registry=' + status + ';workers=0;chain=unbound')
        return
    lock = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Protected Production worker registry lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if REGISTRY.exists() or REGISTRY.is_symlink():
            document, workers = load_registry()
            if document != EMPTY or workers:
                raise ValueError('Existing Production worker inventory needs review')
            status = 'already_empty'
        else:
            fd = os.open(REGISTRY, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                         os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                json.dump(EMPTY, handle, sort_keys=True)
                handle.write('\n')
                handle.flush()
                os.fsync(handle.fileno())
            status = 'installed_empty'
        print('production_worker_registry=' + status + ';workers=0;chain=unbound')
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, BlockingIOError):
        raise SystemExit('Production worker registry preparation failed; '
                         'no credential printed and no worker activated') from None
