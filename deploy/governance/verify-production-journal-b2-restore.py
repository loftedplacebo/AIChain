#!/usr/bin/env python3
"""Authenticate a journal-aware B2 set and restore it into a closed local DB."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import tempfile
from datetime import datetime, timezone

from production_worker_registry import load_registry, verify_catalog


HERE = pathlib.Path(__file__).resolve().parent
SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
ACCEPTANCE = pathlib.Path(
    '/var/lib/aichain-production-backup/journal-restore-acceptance.json')


def import_script(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = import_script('production_b2_restore',
                     HERE / 'verify-production-b2-restore.py')
journal = import_script('production_journal_backup',
                        HERE / 'run-production-journal-backup.py')


def recovery_cluster():
    start = pathlib.Path('/etc/postgresql/17/production-recovery/start.conf')
    config = pathlib.Path('/etc/postgresql/17/production-recovery/postgresql.conf')
    active_start = [line.strip() for line in start.read_text(encoding='ascii').splitlines()
                    if line.strip() and not line.lstrip().startswith('#')]
    listen = [line.strip() for line in config.read_text(encoding='utf-8').splitlines()
              if line.strip().startswith('listen_addresses =')]
    if active_start != ['manual'] or listen != ["listen_addresses = '127.0.0.1'"]:
        raise ValueError('Manual loopback recovery cluster required')
    clusters = subprocess.run(('pg_lsclusters', '-h'), capture_output=True,
                              text=True, timeout=15, check=False)
    if clusters.returncode or not any(line.split()[:4] ==
                                      ['17', 'production-recovery', '5441', 'online']
                                      for line in clusters.stdout.splitlines()):
        raise ValueError('Closed loopback recovery cluster required')


def preflight(backup_id):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9-]{36}', backup_id):
        raise ValueError('Root and exact Production backup ID required')
    schema = base.import_module('production_schema', base.MODULE)
    if not re.fullmatch(r'[a-f0-9]{64}', schema.protected(base.KEY, 65)) or \
            not re.fullmatch(r'[a-f0-9]{64}', schema.protected(base.ADMIN, 1025)):
        raise ValueError('Protected Production archive and recovery keys required')
    credentials = json.loads(schema.protected(base.RESTORE, 4096))
    if not isinstance(credentials, dict) or set(credentials) != {
            'accessKeyId', 'secretAccessKey'} or \
            not re.fullmatch(r'[A-Za-z0-9]{12,64}', credentials['accessKeyId']) or \
            not re.fullmatch(r'[!-~]{20,128}', credentials['secretAccessKey']):
        raise ValueError('Protected Production B2 restore credential required')
    credentials = None
    document, workers = load_registry()
    chain = document['chain']
    if not workers or chain is None:
        raise ValueError('Registered Production mainnet workers required')
    roles = [worker['role'] for worker in workers]
    pointer = json.loads(schema.protected(base.LATEST, 4096))
    if not isinstance(pointer, dict) or set(pointer) != {
            'version', 'environment', 'bucket', 'keyPrefix', 'journalRoles'} or \
            pointer['version'] != 2 or pointer['environment'] != 'prod' or \
            pointer['bucket'] != base.BUCKET or pointer['journalRoles'] != roles or \
            not isinstance(pointer['keyPrefix'], str) or \
            not re.fullmatch(r'orvessian-production/prod/' +
                             re.escape(backup_id) + r'-[a-f0-9-]{36}',
                             pointer['keyPrefix']):
        raise ValueError('Production journal B2 pointer scope mismatch')
    admin = schema.protected(schema.ADMIN, 1025)
    verify_catalog(workers, journal.catalog(schema, admin))
    journal.pinned_core()
    recovery_cluster()
    if not (journal.JOURNAL_RUNNER / 'scripts/governance-backup-object-storage.cjs').is_file() or \
            not base.CLOSED.is_file():
        raise ValueError('Pinned transfer and closed restore runners required')
    return pointer['keyPrefix'], workers, chain


def record_acceptance(backup_id, key_prefix, workers, chain):
    """Record a successful closed B2 drill without storing credentials."""
    directory = ACCEPTANCE.parent
    info = directory.lstat()
    if not directory.is_dir() or directory.is_symlink() or \
            info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Protected Production backup state directory required')
    value = {
        'version': 1,
        'environment': 'prod',
        'backupId': backup_id,
        'keyPrefix': key_prefix,
        'journalRoles': [worker['role'] for worker in workers],
        'chain': chain,
        'result': 'closed-restore-review-passed',
        'completedAt': datetime.now(timezone.utc).isoformat(),
    }
    temporary = None
    try:
        fd, name = tempfile.mkstemp(prefix='.journal-restore-acceptance-',
                                    dir=directory)
        temporary = pathlib.Path(name)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            os.fchmod(handle.fileno(), 0o600)
            json.dump(value, handle, sort_keys=True, separators=(',', ':'))
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, ACCEPTANCE)
        temporary = None
        directory_fd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY |
                               os.O_NOFOLLOW)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    key_prefix, workers, chain = preflight(args.backup_id)
    if args.apply:
        base.download_and_restore(args.backup_id, key_prefix,
                                  expected_workers=workers, chain=chain,
                                  runner=journal.JOURNAL_RUNNER)
        record_acceptance(args.backup_id, key_prefix, workers, chain)
        print('production_journal_b2_restore=accepted;backup_id=' +
              args.backup_id + ';workers=' + str(len(workers)))
    else:
        print('production_journal_b2_restore=ready;mode=read-only;workers=' +
              str(len(workers)))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production journal B2 restore failed; no secret printed; '
                         'no service activated') from None
