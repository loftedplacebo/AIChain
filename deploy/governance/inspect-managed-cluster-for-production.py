#!/usr/bin/env python3
"""Read-only inventory of the retained managed pilot cluster before reuse."""

import json
import os
import pathlib
import stat
import subprocess

from pilot_db_binding import load_admin


HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
PSQL = '/usr/lib/postgresql/17/bin/psql'
SQL = """
SELECT json_build_object(
  'databases', (SELECT coalesce(json_agg(json_build_object(
    'name', d.datname, 'owner', pg_get_userbyid(d.datdba),
    'sizeBytes', pg_database_size(d.datname),
    'connections', (SELECT count(*) FROM pg_stat_activity a WHERE a.datname=d.datname)
  ) ORDER BY d.datname), '[]'::json)
  FROM pg_database d WHERE d.datname LIKE 'governance_%' OR d.datname LIKE 'gov_restore_%'),
  'roles', (SELECT coalesce(json_agg(json_build_object(
    'name', r.rolname, 'login', r.rolcanlogin, 'superuser', r.rolsuper,
    'createDb', r.rolcreatedb, 'createRole', r.rolcreaterole
  ) ORDER BY r.rolname), '[]'::json)
  FROM pg_roles r WHERE r.rolname LIKE 'governance_%'),
  'maxConnections', (SELECT setting::integer FROM pg_settings WHERE name='max_connections'),
  'reservedConnections', (SELECT setting::integer FROM pg_settings WHERE name='superuser_reserved_connections'),
  'currentConnections', (SELECT count(*) FROM pg_stat_activity)
);
"""


def protected(path: pathlib.Path, maximum: int) -> str:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o077 or not 1 <= info.st_size <= maximum:
        raise ValueError('Protected managed-cluster prerequisite required')
    return path.read_text(encoding='utf-8').rstrip('\n')


def main() -> None:
    if os.geteuid() != 0:
        raise ValueError('Root required')
    active = load_admin()
    if active['profile'] != 'contabo-local':
        raise ValueError('Pilot must already use Contabo local PostgreSQL')
    active['password'] = ''
    if not CA.is_file() or CA.is_symlink():
        raise ValueError('Managed-cluster CA required')
    password = protected(PASSWORD, 1025)
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment.update(PGPASSWORD=password, PGCONNECT_TIMEOUT='5')
    dsn = (f'host={HOST} port=25060 dbname=defaultdb user=doadmin '
           f'sslmode=verify-full sslrootcert={CA}')
    result = subprocess.run((PSQL, '-X', '-q', '-t', '-A', '-w', '-v', 'ON_ERROR_STOP=1',
                             '-d', dsn, '-c', SQL), env=environment, text=True,
                            capture_output=True, timeout=30, check=False)
    environment['PGPASSWORD'] = ''
    if result.returncode:
        raise ValueError('Read-only managed-cluster inventory failed')
    inventory = json.loads(result.stdout)
    if not isinstance(inventory.get('databases'), list) or not isinstance(inventory.get('roles'), list):
        raise ValueError('Managed-cluster inventory is incomplete')
    print(json.dumps(inventory, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired, json.JSONDecodeError):
        raise SystemExit('Managed-cluster inventory failed; no credentials printed') from None
