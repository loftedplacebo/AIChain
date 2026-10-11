#!/usr/bin/env python3
"""Create a closed rehearsal copy of the managed synthetic pilot on local PG17.

This never changes a service, source database, or existing target database.
The final writer-paused cutover needs a fresh capture and separate acceptance.
"""

import json
import os
import pathlib
import re
import secrets
import stat
import subprocess


ROOT = pathlib.Path('/var/lib/aichain-pilot-db-migration')
SOURCE_PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
SOURCE_HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
SOURCE_CA = '/etc/aichain/governance/digitalocean-ca.crt'
TARGET = 'governance_test_candidate'
ROLES = ('governance_migrations', 'governance_api', 'governance_evidence_worker')
PG = pathlib.Path('/usr/lib/postgresql/17/bin')


def run(args, *, env=None, input_text=None, timeout=180):
    result = subprocess.run(args, env=env, input=input_text, text=True,
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Database copy step failed; inspect protected operator diagnostics')
    return result.stdout


def admin_sql(sql):
    return run(('runuser', '-u', 'postgres', '--', str(PG / 'psql'), '-X', '-q', '-t', '-A',
                '-v', 'ON_ERROR_STOP=1', '-p', '5433', '-d', 'postgres'),
               input_text=sql)


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Run as root')
    source_stat = SOURCE_PASSWORD.lstat()
    if not stat.S_ISREG(source_stat.st_mode) or source_stat.st_uid != 0 or \
            stat.S_IMODE(source_stat.st_mode) != 0o600 or not 1 <= source_stat.st_size <= 1025:
        raise RuntimeError('Protected managed database credential required')
    if ROOT.exists():
        raise RuntimeError('A migration rehearsal directory already exists; review it before retrying')
    existing = admin_sql("SELECT datname FROM pg_database WHERE datname = 'governance_test_candidate';\n")
    if existing.strip():
        raise RuntimeError('Candidate database already exists')
    for role in ROLES:
        existing = admin_sql(f"SELECT rolname FROM pg_roles WHERE rolname = '{role}';\n")
        if existing.strip():
            raise RuntimeError('Candidate role already exists')
    print('Local target preflight: PASSED', flush=True)
    ROOT.mkdir(mode=0o700)
    os.chmod(ROOT, 0o700)
    source_env = os.environ.copy()
    source_env.update(PGPASSWORD=SOURCE_PASSWORD.read_text(encoding='utf-8').rstrip('\n'),
                      PGSSLMODE='verify-full', PGSSLROOTCERT=SOURCE_CA,
                      PGCONNECT_TIMEOUT='10')
    archive = ROOT / 'governance_test.rehearsal.dump'
    run((str(PG / 'pg_dump'), '-Fc', '--no-owner', '--no-acl', '-h', SOURCE_HOST,
         '-p', '25060', '-U', 'doadmin', '-d', 'governance_test', '-f', str(archive)),
        env=source_env, timeout=300)
    print('Managed source snapshot: CAPTURED', flush=True)
    source_env['PGPASSWORD'] = ''
    os.chmod(archive, 0o600)
    if archive.stat().st_size < 1024:
        raise RuntimeError('Unexpectedly small source archive')
    passwords = {role: secrets.token_hex(32) for role in ROLES}
    fd = os.open(ROOT / 'candidate-roles.json', os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(passwords, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    for role, password in passwords.items():
        assert re.fullmatch(r'[a-z_]+', role) and re.fullmatch(r'[0-9a-f]{64}', password)
        admin_sql(f"CREATE ROLE {role} LOGIN PASSWORD '{password}';\n")
    print('Local roles: CREATED', flush=True)
    admin_sql(f'CREATE DATABASE {TARGET} OWNER governance_migrations;\n')
    admin_sql(f'REVOKE ALL ON DATABASE {TARGET} FROM PUBLIC;\n'
              f'GRANT CONNECT ON DATABASE {TARGET} TO governance_migrations, governance_api, governance_evidence_worker;\n')
    target_env = os.environ.copy()
    target_env.update(PGPASSWORD=passwords['governance_migrations'], PGSSLMODE='disable',
                      PGCONNECT_TIMEOUT='10')
    run((str(PG / 'pg_restore'), '--exit-on-error', '--no-owner', '--no-acl',
         '-h', '127.0.0.1', '-p', '5433', '-U', 'governance_migrations',
         '-d', TARGET, str(archive)), env=target_env, timeout=300)
    target_env['PGPASSWORD'] = ''
    print('Closed PostgreSQL 17 pilot rehearsal copy: RESTORED')
    print('Target database:', TARGET)
    print('Encrypted/off-host backup and final writer-paused cutover: NOT YET TESTED')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.TimeoutExpired) as error:
        raise SystemExit(f'Closed pilot rehearsal copy failed ({error}); live services unchanged') from None
