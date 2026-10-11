"""Strict protected administrator binding for the synthetic hosted pilot."""

import json
import os
import pathlib
import stat

BINDING = pathlib.Path('/etc/aichain/pilot-database-binding.json')
MANAGED = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
CA = '/etc/aichain/governance/digitalocean-ca.crt'


def _protected(path: pathlib.Path, limit: int) -> str:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= limit:
        raise ValueError('Protected root-only database binding required')
    return path.read_text(encoding='utf-8')


def load_admin() -> dict:
    if os.geteuid() != 0:
        raise ValueError('Root operator required')
    value = json.loads(_protected(BINDING, 2048))
    if not isinstance(value, dict) or set(value) != {
            'profile', 'host', 'port', 'database', 'user', 'sslmode',
            'caFile', 'passwordFile'}:
        raise ValueError('Exact pilot database binding required')
    common = value['database'] == 'governance_test'
    managed = (value['profile'] == 'managed' and value['host'] == MANAGED and
               value['port'] == 25060 and value['user'] == 'doadmin' and
               value['sslmode'] == 'verify-full' and value['caFile'] == CA and
               value['passwordFile'] == '/etc/aichain/pilot-backup/database-password')
    local = (value['profile'] == 'contabo-local' and value['host'] == '127.0.0.1' and
             value['port'] == 5433 and value['user'] == 'postgres' and
             value['sslmode'] == 'disable' and value['caFile'] is None and
             value['passwordFile'] == '/var/lib/aichain-pilot-db-migration/local-postgres-password')
    if not common or not (managed or local):
        raise ValueError('Unreviewed pilot database binding')
    password = _protected(pathlib.Path(value['passwordFile']), 1025).rstrip('\n')
    if not password or '\n' in password or '\r' in password:
        raise ValueError('Invalid protected pilot database password')
    return {**value, 'password': password}


def psql_environment(binding: dict) -> dict:
    env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    env.update(PGPASSWORD=binding['password'], PGSSLMODE=binding['sslmode'],
               PGCONNECT_TIMEOUT='5')
    if binding['caFile']:
        env['PGSSLROOTCERT'] = binding['caFile']
    return env


def psql_dsn(binding: dict) -> str:
    return (f"host={binding['host']} port={binding['port']} "
            f"dbname={binding['database']} user={binding['user']} "
            f"sslmode={binding['sslmode']}" +
            (f" sslrootcert={binding['caFile']}" if binding['caFile'] else ''))


def recovery_connection(binding: dict) -> dict:
    result = {key: binding[key] for key in ('host', 'port', 'database', 'user', 'password')}
    if binding['profile'] == 'managed':
        result.update(sslmode='verify-full', caFile=binding['caFile'])
    return result
