#!/usr/bin/env python3
"""Apply initial production schema and grants with a one-time migration login."""

import argparse
import base64
import hashlib
import hmac
import json
import os
import pathlib
import secrets
import stat
import subprocess


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api')
SQL = SETUP / 'production-exclusive-db-sql'
ADMIN = pathlib.Path('/etc/aichain/production/database-admin-password')
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
PSQL = '/usr/lib/postgresql/17/bin/psql'
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
COMMIT = '271c129f752cffd8095e9fbdc7b0339d3390f0d8'
ARCHIVE = 'c266034f172a43e41b84ea405281a31193a6d0d9799fbbbff25968a601e00055'
GRANTS = {
    '02-api-grants.sql': '79308823125d688e1498f027efd39d86faacb3381dd3280111b7cfbf4f492817',
    '03-worker-grants.sql': '495be1266ad977ca9d320ae55ac70b83f4056182811656d937c97cfcda8e46ef',
}
ROLES = {'governance_prod_api', 'governance_prod_worker', 'governance_prod_migrations'}


def protected(path, maximum):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or \
            not 1 <= info.st_size <= maximum:
        raise ValueError('Protected production prerequisite required')
    value = path.read_text(encoding='utf-8').rstrip('\n')
    if not value or '\n' in value or '\r' in value:
        raise ValueError('Invalid protected production prerequisite')
    return value


def psql(user, password, sql):
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment.update(PGPASSWORD=password, PGCONNECT_TIMEOUT='5')
    dsn = (f'host={HOST} port=25060 dbname=governance_prod user={user} '
           f'sslmode=verify-full sslrootcert={CA}')
    try:
        result = subprocess.run((PSQL, '-X', '-q', '-t', '-A', '-w',
                                 '-v', 'ON_ERROR_STOP=1', '-d', dsn),
                                input=sql, env=environment, text=True,
                                capture_output=True, timeout=120, check=False)
        if result.returncode:
            raise ValueError('Production SQL operation failed; inspect phase and database state')
        return result.stdout.strip()
    finally:
        environment['PGPASSWORD'] = ''


def migration_count():
    files = sorted((RELEASE / 'services/governance/migrations').glob('[0-9]*.sql'))
    if len(files) < 19:
        raise ValueError('Expected production migration files are missing')
    return len(files)


def scram_verifier(password):
    """Build the PostgreSQL SCRAM verifier locally, never sending plaintext in SQL."""
    salt = secrets.token_bytes(16)
    salted = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 4096)
    stored = hashlib.sha256(hmac.digest(salted, b'Client Key', 'sha256')).digest()
    server = hmac.digest(salted, b'Server Key', 'sha256')
    encode = lambda value: base64.b64encode(value).decode('ascii')
    return f'SCRAM-SHA-256$4096:{encode(salt)}${encode(stored)}:{encode(server)}'


def preflight():
    if os.geteuid() != 0 or not CA.is_file() or CA.is_symlink():
        raise ValueError('Root and verified managed-database CA required')
    admin = protected(ADMIN, 1025)
    manifest = json.loads((RELEASE / 'PRODUCTION-RELEASE.json').read_text(encoding='utf-8'))
    if manifest != {'activation': 'disabled', 'archiveSha256': ARCHIVE,
                    'service': 'orvessian-production-api.service',
                    'sourceCommit': COMMIT}:
        raise ValueError('Pinned production API release required')
    if not (RELEASE / 'services/governance/postgres-migrate.cjs').is_file():
        raise ValueError('Production migration entrypoint missing')
    for name, digest in GRANTS.items():
        path = SQL / name
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or \
                hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            raise ValueError('Reviewed production grant SQL mismatch')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          capture_output=True, text=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled and inactive')
    hosted = subprocess.run(('python3', str(SETUP / 'check-pilot-hosted-health.py')),
                            capture_output=True, text=True, timeout=45, check=False)
    if hosted.returncode or json.loads(hosted.stdout).get('healthy') is not True:
        raise ValueError('Synthetic pilot health must remain green')
    inventory = subprocess.run(('python3', str(SETUP / 'inspect-managed-cluster-for-production.py')),
                               capture_output=True, text=True, timeout=45, check=False)
    if inventory.returncode:
        raise ValueError('Managed production inventory failed')
    current = json.loads(inventory.stdout)
    databases = current.get('databases')
    if not isinstance(databases, list) or len(databases) != 1 or \
            databases[0].get('connections') != 0 or \
            databases[0].get('name') != 'governance_prod' or \
            databases[0].get('owner') != 'doadmin' or \
            not isinstance(databases[0].get('sizeBytes'), int) or \
            {role.get('name') for role in current.get('roles', [])} != ROLES or \
            any(role.get('login') is not False or role.get('superuser') is not False or
                role.get('createDb') is not False or role.get('createRole') is not False
                for role in current['roles']):
        raise ValueError('Managed production objects differ from empty bootstrap')
    if psql('doadmin', admin,
            "SELECT count(*) FROM pg_tables WHERE schemaname='public';") != '0':
        raise ValueError('Production database already has schema; review before retry')
    return admin, migration_count()


def run_migrations(password):
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment.update(
        GOVERNANCE_ENV='prod',
        GOVERNANCE_MIGRATION_URL=(f'postgresql://governance_prod_migrations:{password}'
                                  f'@{HOST}:25060/governance_prod?sslmode=verify-full'),
        GOVERNANCE_DATABASE_CA_FILE=str(CA),
    )
    try:
        result = subprocess.run((NODE, 'services/governance/postgres-migrate.cjs'),
                                cwd=RELEASE, env=environment, text=True,
                                capture_output=True, timeout=180, check=False)
        if result.returncode or 'Governance migrations complete' not in result.stdout:
            raise ValueError('Production migration failed; inspect database state')
    finally:
        environment['GOVERNANCE_MIGRATION_URL'] = ''


def apply(admin, count):
    one_time_password = secrets.token_hex(32)
    verifier = scram_verifier(one_time_password)
    psql('doadmin', admin,
         "ALTER ROLE governance_prod_migrations LOGIN PASSWORD '" + verifier + "';")
    try:
        run_migrations(one_time_password)
        grants = 'BEGIN;\nREVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;\n'
        grants += ''.join((SQL / name).read_text(encoding='utf-8') + '\n' for name in GRANTS)
        grants += 'COMMIT;\n'
        psql('governance_prod_migrations', one_time_password, grants)
        status = psql('governance_prod_migrations', one_time_password,
                      "SELECT (SELECT count(*) FROM governance_migrations),"
                      "(SELECT name FROM governance_environment),"
                      "(SELECT state FROM governance_recovery_gate),"
                      "(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,"
                      "LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a "
                      "WHERE n.nspname='public' AND c.relkind IN ('r','p') AND a.grantee=0);")
        if status != f'{count}|prod|active|0':
            raise ValueError('Production migration or PUBLIC access review failed')
    finally:
        psql('doadmin', admin, 'ALTER ROLE governance_prod_migrations NOLOGIN PASSWORD NULL;')
    print('production_schema=installed;environment=prod;public_table_grants=none;'
          'migration_role=NOLOGIN;api=disabled')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    admin, count = preflight()
    if not args.apply:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'migrationCount': count, 'api': 'disabled'}, sort_keys=True))
        return
    apply(admin, count)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production schema operation failed; inspect partial state; no secret printed') from None
