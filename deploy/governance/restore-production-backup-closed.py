#!/usr/bin/env python3
"""Restore an authenticated production archive to the closed local cluster."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import secrets
import stat
import subprocess
import tempfile


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RUNNER = pathlib.Path('/opt/aichain/orvessian-production-backup-runner')
ROOT = pathlib.Path('/etc/aichain/production/backup')
KEY = ROOT / 'backup.key'
ADMIN = ROOT / 'restore-admin-password'
ARCHIVES = pathlib.Path('/var/lib/aichain-production-backup/archives')
RESTORES = pathlib.Path('/var/lib/aichain-production-backup/restores')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
MODULE = SETUP / 'apply-production-schema.py'


def private_json(directory, name, value):
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return path


def protected_module():
    spec = importlib.util.spec_from_file_location('production_schema', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_archive(backup_id):
    found = []
    for directory in ARCHIVES.glob('pg-backup-*'):
        if not directory.is_dir() or directory.is_symlink():
            continue
        marker = directory / 'complete.json'
        if not marker.is_file() or marker.is_symlink() or marker.stat().st_size > 4096:
            continue
        value = json.loads(marker.read_text(encoding='utf-8'))
        if value.get('id') == backup_id and value.get('environment') == 'prod':
            found.append(directory)
    if len(found) != 1:
        raise ValueError('Exactly one matching closed production archive required')
    return found[0]


def preflight(backup_id):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9-]{36}', backup_id):
        raise ValueError('Root and exact production backup ID required')
    module = protected_module()
    key = module.protected(KEY, 65)
    admin = module.protected(ADMIN, 1025)
    if not re.fullmatch(r'[a-f0-9]{64}', key) or not re.fullmatch(r'[a-f0-9]{64}', admin):
        raise ValueError('Separate protected recovery credentials required')
    start = pathlib.Path('/etc/postgresql/17/production-recovery/start.conf')
    if start.read_text(encoding='ascii').strip() != 'manual':
        raise ValueError('Manual-start recovery cluster required')
    clusters = subprocess.run(('pg_lsclusters', '-h'), capture_output=True,
                              text=True, timeout=15, check=False)
    if clusters.returncode or not any(line.split()[:4] ==
                                      ['17', 'production-recovery', '5441', 'online']
                                      for line in clusters.stdout.splitlines()):
        raise ValueError('Closed loopback recovery cluster required')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          capture_output=True, text=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled')
    if not (RUNNER / 'scripts/governance-postgres-recovery.cjs').is_file():
        raise ValueError('Isolated production recovery runner required')
    return source_archive(backup_id), admin


def restore(archive, admin, backup_id):
    RESTORES.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = RESTORES.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Protected production restore directory required')
    target = 'gov_restore_prod_' + secrets.token_hex(6)
    with tempfile.TemporaryDirectory(prefix='production-restore-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        connection = {'host': '127.0.0.1', 'port': 5441, 'database': 'postgres',
                      'user': 'postgres', 'password': admin}
        source = private_json(private, 'operator.json', connection)
        config = private_json(private, 'restore.json', {
            'environment': 'prod', 'connectionFile': str(source),
            'binaries': '/usr/lib/postgresql/17/bin', 'directory': str(archive),
            'outputRoot': str(RESTORES), 'keyFile': str(KEY),
            'targetDatabase': target, 'approvedMigrations': [],
        })
        result = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                 'restore', str(config)), cwd=RUNNER,
                                capture_output=True, text=True, timeout=300, check=False)
        if result.returncode:
            raise ValueError('Closed production restore failed')
        restored = json.loads(result.stdout)
        if restored.get('operation') != 'restore' or restored.get('backupId') != backup_id or \
                restored.get('environment') != 'prod' or \
                restored.get('targetDatabase') != target or \
                restored.get('access') != 'revoked-and-disabled' or \
                restored.get('activation') != 'review-required' or \
                restored.get('journalRoles') != []:
            raise ValueError('Closed production restore state mismatch')
        reviewed_source = private_json(private, 'review-operator.json',
                                       {**connection, 'database': target})
        review = private_json(private, 'review.json', {
            'environment': 'prod', 'connectionFile': str(reviewed_source),
            'binaries': '/usr/lib/postgresql/17/bin',
            'directory': restored['directory'],
        })
        checked = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                  'review', str(review)), cwd=RUNNER,
                                 capture_output=True, text=True, timeout=120, check=False)
        if checked.returncode:
            raise ValueError('Closed production restore review failed')
        verified = json.loads(checked.stdout)
        if verified.get('operation') != 'review' or verified.get('review') != 'passed' or \
                verified.get('environment') != 'prod' or \
                verified.get('activation') != 'review-required' or \
                verified.get('journalRoles') != []:
            raise ValueError('Production restore review mismatch')
        print('production_restore=review_passed;access=revoked_and_disabled;'
              f'target={target};source_managed_database=untouched;service=off')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    archive, admin = preflight(args.backup_id)
    if args.apply:
        restore(archive, admin, args.backup_id)
    else:
        print('production_restore=ready;mode=read-only;archive=' + archive.name)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Closed production restore failed; no secret printed; no service activated') from None
