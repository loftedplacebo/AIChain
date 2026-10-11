#!/usr/bin/env python3
"""Retire exactly the reviewed managed pilot objects after the local backup gate."""

import argparse
import importlib.util
import json
import os
import pathlib
import subprocess

from pilot_db_binding import load_admin


ROOT = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
PSQL = '/usr/lib/postgresql/17/bin/psql'
DATABASES = (
    'gov_restore_b2_675760d159ba',
    'gov_restore_b2_c1e41b11b58a',
    'gov_restore_b2_c308eaf13583',
    'gov_restore_b2_c8073805c276',
    'gov_restore_b2_e60fcb48a34d',
    'governance_test',
)
ROLES = ('governance_api', 'governance_evidence_worker',
         'governance_migrations')


def preflight_module():
    path = ROOT / 'preflight-production-cluster-retirement.py'
    spec = importlib.util.spec_from_file_location('retirement_preflight', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check(preflight):
    backup = preflight.read_check('check-pilot-backup-health.py')
    hosted = preflight.read_check('check-pilot-hosted-health.py')
    inventory = preflight.read_check('inspect-managed-cluster-for-production.py')
    recovery = preflight.read_check('inspect-accelerated-retirement-checkpoint.py')
    verdict = preflight.assess(backup, hosted, inventory, recovery)
    if not verdict['ready']:
        raise ValueError('Retirement preflight blocked: ' + ','.join(verdict['blockers']))
    return verdict


def run_sql(environment, sql):
    dsn = (f'host={HOST} port=25060 dbname=defaultdb user=doadmin '
           f'sslmode=verify-full sslrootcert={CA}')
    result = subprocess.run((PSQL, '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
                             '-d', dsn, '-c', sql), env=environment,
                            text=True, capture_output=True, timeout=60,
                            check=False)
    if result.returncode:
        raise ValueError('Managed retirement SQL failed; stop and inspect the current inventory')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true',
                        help='Retire exactly the six reviewed databases and three roles')
    args = parser.parse_args()
    if os.geteuid() != 0 or load_admin()['profile'] != 'contabo-local':
        raise ValueError('Root and an active Contabo-local pilot are required')
    preflight = preflight_module()
    verdict = check(preflight)
    if not args.apply:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'databases': list(DATABASES), 'roles': list(ROLES),
                          'backup': verdict['last_completed_upload_utc']}, sort_keys=True))
        return
    info = PASSWORD.lstat()
    if not PASSWORD.is_file() or PASSWORD.is_symlink() or info.st_uid != 0 or \
            info.st_mode & 0o077 or not 1 <= info.st_size <= 1025 or \
            not CA.is_file() or CA.is_symlink():
        raise ValueError('Protected managed administrator credential required')
    password = PASSWORD.read_text(encoding='utf-8').rstrip('\n')
    if not password or '\n' in password or '\r' in password:
        raise ValueError('Invalid managed administrator credential')
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith('PG')}
    environment.update(PGPASSWORD=password, PGCONNECT_TIMEOUT='5')
    # A new connection between the preflight and a DROP causes PostgreSQL to
    # reject that database; do not force-terminate a client or use CASCADE.
    for database in DATABASES:
        run_sql(environment, f'DROP DATABASE "{database}";')
        print('retired_database=' + database, flush=True)
    for role in ROLES:
        run_sql(environment, f'DROP ROLE "{role}";')
        print('retired_role=' + role, flush=True)
    environment['PGPASSWORD'] = ''
    after = preflight.read_check('inspect-managed-cluster-for-production.py')
    if after.get('databases') or after.get('roles'):
        raise ValueError('Managed retirement incomplete; inspect remaining objects')
    print('managed_pilot_retirement=complete')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired, json.JSONDecodeError):
        raise SystemExit('Managed pilot retirement stopped; no credentials printed') from None
