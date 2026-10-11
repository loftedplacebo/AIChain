#!/usr/bin/env python3
"""Apply the reviewed, hash-pinned empty production database bootstrap."""

import argparse
import hashlib
import json
import os
import pathlib
import stat
import subprocess

from pilot_db_binding import load_admin


ROOT = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
SQL_DIR = ROOT / 'production-exclusive-db-sql'
PRODUCTION_PASSWORD = pathlib.Path('/etc/aichain/production/database-admin-password')
LEGACY_PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
PSQL = '/usr/lib/postgresql/17/bin/psql'
HASHES = {
    '00-create-empty.sql': 'a5046b6d0c1adcec5bbefffb01b718bf9acb24e0d82ef5bc85d323fbf82ddbdd',
    '01-bootstrap.sql': '292a3d306d0a6b19c30e923cbe37cfd0f44d2cffca35e8fb332d91102650f9c6',
    '04-verify-exclusive.sql': 'dcf4247a9d142bfd5f4e79d700312a695908d095acc4eba0b8c5b5c4cddad853',
}
EXPECTED_DATABASES = {'governance_prod'}
EXPECTED_ROLES = {'governance_prod_api', 'governance_prod_worker',
                  'governance_prod_migrations'}


def inventory():
    result = subprocess.run(('python3', str(ROOT / 'inspect-managed-cluster-for-production.py')),
                            text=True, capture_output=True, timeout=45, check=False)
    if result.returncode:
        raise ValueError('Managed inventory failed')
    return json.loads(result.stdout)


def check_sql():
    for name, expected in HASHES.items():
        path = SQL_DIR / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                info.st_mode & 0o022 or info.st_size < 1 or info.st_size > 10000:
            raise ValueError('Reviewed SQL file permissions or size changed')
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('Reviewed SQL hash changed')


def connection_environment():
    credential = (PRODUCTION_PASSWORD if PRODUCTION_PASSWORD.exists() or
                  PRODUCTION_PASSWORD.is_symlink() else LEGACY_PASSWORD)
    info = credential.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o077 or not 1 <= info.st_size <= 1025 or \
            not CA.is_file() or CA.is_symlink():
        raise ValueError('Protected administrator credential or CA required')
    password = credential.read_text(encoding='utf-8').rstrip('\n')
    if not password or '\n' in password or '\r' in password:
        raise ValueError('Invalid protected administrator credential')
    environment = {key: value for key, value in os.environ.items()
                   if not key.startswith('PG')}
    environment.update(PGPASSWORD=password, PGCONNECT_TIMEOUT='5')
    return environment


def apply_file(environment, database, name):
    dsn = (f'host={HOST} port=25060 dbname={database} user=doadmin '
           f'sslmode=verify-full sslrootcert={CA}')
    result = subprocess.run((PSQL, '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
                             '-d', dsn, '-f', str(SQL_DIR / name)),
                            env=environment, text=True, capture_output=True,
                            timeout=60, check=False)
    if result.returncode:
        raise ValueError('Production SQL failed at ' + name + '; inspect partial state')
    print('applied_sql=' + name, flush=True)


def verify_inventory():
    current = inventory()
    databases = current.get('databases', [])
    roles = current.get('roles', [])
    if {item.get('name') for item in databases} != EXPECTED_DATABASES or \
            {item.get('name') for item in roles} != EXPECTED_ROLES or \
            any(item.get('owner') != 'doadmin' for item in databases) or \
            any(item.get('login') is not False or item.get('superuser') is not False or
                item.get('createDb') is not False or item.get('createRole') is not False
                for item in roles):
        raise ValueError('Production inventory differs from reviewed empty bootstrap')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    if args.apply and args.verify:
        raise ValueError('Choose one mode')
    if os.geteuid() != 0 or load_admin()['profile'] != 'contabo-local':
        raise ValueError('Root and active Contabo-local pilot binding required')
    check_sql()
    if args.verify:
        verify_inventory()
        environment = connection_environment()
        try:
            apply_file(environment, 'governance_prod', '04-verify-exclusive.sql')
        finally:
            environment['PGPASSWORD'] = ''
        print('production_empty_bootstrap=verified')
        return
    current = inventory()
    if current.get('databases') or current.get('roles'):
        raise ValueError('Managed cluster is not empty of application objects')
    if not args.apply:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'sqlFiles': list(HASHES)}, sort_keys=True))
        return
    environment = connection_environment()
    try:
        apply_file(environment, 'defaultdb', '00-create-empty.sql')
        apply_file(environment, 'governance_prod', '01-bootstrap.sql')
        apply_file(environment, 'governance_prod', '04-verify-exclusive.sql')
    finally:
        environment['PGPASSWORD'] = ''
    verify_inventory()
    print('production_empty_bootstrap=complete')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired,
            json.JSONDecodeError):
        raise SystemExit('Production empty bootstrap stopped; no credentials printed') from None
