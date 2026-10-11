#!/usr/bin/env python3
"""Capture and authenticate an offline encrypted production DB snapshot."""

import argparse
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import tempfile


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RUNNER = pathlib.Path('/opt/aichain/orvessian-production-backup-runner-8285df6')
ROOT = pathlib.Path('/etc/aichain/production/backup')
KEY = ROOT / 'backup.key'
ARCHIVES = pathlib.Path('/var/lib/aichain-production-backup/archives')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
MODULE = SETUP / 'apply-production-schema.py'


def schema_module():
    spec = importlib.util.spec_from_file_location('production_schema', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def private_json(directory, name, value):
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return path


def preflight(module):
    if os.geteuid() != 0 or not RUNNER.is_dir():
        raise ValueError('Root and isolated production backup runner required')
    if not (RUNNER / 'scripts/governance-postgres-recovery.cjs').is_file():
        raise ValueError('Production backup entrypoint missing')
    key = module.protected(KEY, 65)
    if len(key) != 64 or any(char not in '0123456789abcdef' for char in key):
        raise ValueError('Distinct production archive key required')
    for service in ('orvessian-production-api.service',):
        result = subprocess.run(('systemctl', 'show', service,
                                 '-p', 'UnitFileState', '-p', 'ActiveState'),
                                capture_output=True, text=True, timeout=15, check=False)
        if result.returncode or set(result.stdout.splitlines()) != {
                'UnitFileState=disabled', 'ActiveState=inactive'}:
            raise ValueError('Production writers must remain disabled')
    inventory = subprocess.run(('python3', str(SETUP / 'inspect-managed-cluster-for-production.py')),
                               capture_output=True, text=True, timeout=45, check=False)
    if inventory.returncode:
        raise ValueError('Managed production inventory failed')
    current = json.loads(inventory.stdout)
    databases = current.get('databases')
    if not isinstance(databases, list) or len(databases) != 1 or \
            databases[0].get('name') != 'governance_prod' or \
            databases[0].get('connections') != 0:
        raise ValueError('Production database is not quiesced')
    admin = module.protected(module.ADMIN, 1025)
    if module.psql('doadmin', admin, 'SELECT name FROM governance_environment;') != 'prod':
        raise ValueError('Production database marker mismatch')
    return admin


def capture(module, admin):
    ARCHIVES.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = ARCHIVES.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Protected production archive directory required')
    with tempfile.TemporaryDirectory(prefix='production-backup-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        connection = private_json(private, 'source.json', {
            'host': module.HOST, 'port': 25060, 'database': 'governance_prod',
            'user': 'doadmin', 'password': admin, 'sslmode': 'verify-full',
            'caFile': str(module.CA),
        })
        config = private_json(private, 'capture.json', {
            'environment': 'prod', 'connectionFile': str(connection),
            'binaries': '/usr/lib/postgresql/17/bin', 'journals': [],
            'outputRoot': str(ARCHIVES), 'keyFile': str(KEY),
            'consistency': 'quiesced',
        })
        admin = ''
        result = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                 'backup', str(config)), cwd=RUNNER,
                                capture_output=True, text=True, timeout=300, check=False)
        if result.returncode:
            raise ValueError('Production encrypted capture failed')
        backup = json.loads(result.stdout)
        if backup.get('operation') != 'backup' or backup.get('environment') != 'prod' or \
                backup.get('journalRoles') != [] or not isinstance(backup.get('directory'), str):
            raise ValueError('Unexpected production capture result')
        inspect = private_json(private, 'inspect.json', {
            'environment': 'prod', 'directory': backup['directory'],
            'keyFile': str(KEY), 'maxAgeHours': 1,
        })
        checked = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                  'inspect', str(inspect)), cwd=RUNNER,
                                 capture_output=True, text=True, timeout=300, check=False)
        if checked.returncode:
            raise ValueError('Production encrypted capture authentication failed')
        verified = json.loads(checked.stdout)
        if verified.get('operation') != 'inspect' or verified.get('integrity') != 'verified' or \
                verified.get('environment') != 'prod' or verified.get('id') != backup.get('id') or \
                verified.get('journalRoles') != []:
            raise ValueError('Production encrypted capture review mismatch')
        print('production_backup=encrypted_and_authenticated;off_host_upload=pending;'
              'backup_id=' + backup['id'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    module = schema_module()
    admin = preflight(module)
    if args.apply:
        capture(module, admin)
    else:
        print('production_backup=ready;mode=read-only;api=disabled')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production backup failed; no secret printed; no service activated') from None
