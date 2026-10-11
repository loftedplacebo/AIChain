#!/usr/bin/env python3
"""Apply a reviewed, reversible hosted-pilot SQL release in one transaction.

Requires a recent completed B2 backup, pinned root-owned up/down SQL, and a
fully active pilot. Application records both digests in the database. An
explicit rollback requires the same SQL and matching release record.
"""
import argparse
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import time
from pilot_db_binding import load_admin, psql_environment

BACKUP = pathlib.Path('/etc/aichain/pilot-backup')
LOCK = pathlib.Path('/opt/aichain/.governance-pilot-database-release.lock')
HEALTH = '/opt/aichain/governance-pilot-db-setup/check-pilot-hosted-health.py'
BACKUP_HEALTH = '/opt/aichain/governance-pilot-db-setup/check-pilot-backup-health.py'
PSQL = '/usr/lib/postgresql/17/bin/psql'
PORTAL_UNIT = 'orvessian-pilot-portal.service'
API_UNIT = 'aichain-governance-synthetic-api.service'
MAX_SQL_BYTES = 256 * 1024
MAX_BACKUP_AGE_SECONDS = 15 * 60
TABLE = 'public.governance_pilot_schema_releases'


def verify_sql(path, digest):
    if not path.is_absolute() or not re.fullmatch(r'[a-f0-9]{64}', digest):
        raise ValueError('Absolute SQL path and SHA-256 required')
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or not 1 <= info.st_size <= MAX_SQL_BYTES:
        raise ValueError('Root-owned reviewed SQL required')
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != digest:
        raise ValueError('SQL SHA-256 mismatch')
    # psql meta-commands and transaction controls would escape the atomic gate.
    if any(line.lstrip().startswith(b'\\') for line in data.splitlines()) or \
            re.search(rb'(?im)(?:^|;)\s*(begin|commit|rollback|end)\b', data):
        raise ValueError('SQL contains a transaction or psql meta-command')


def check_backup():
    result = subprocess.run(('python3', BACKUP_HEALTH), check=True,
                            capture_output=True, text=True, timeout=35)
    status = json.loads(result.stdout)
    age = time.time() - (BACKUP / 'latest-upload.json').stat().st_mtime
    if status.get('healthy') is not True or \
            status.get('marker_valid') is not True or \
            status.get('latest_due_backup_covered') is not True or \
            not 0 <= age <= MAX_BACKUP_AGE_SECONDS:
        raise ValueError('Fresh completed B2 backup required')


def database_connection():
    binding = load_admin()
    if binding['profile'] != 'contabo-local':
        raise ValueError('Pilot database releases require the local Contabo profile')
    environment = psql_environment(binding)
    dsn = (f"host={binding['host']} port={binding['port']} "
           f"dbname={binding['database']} user={binding['user']} "
           f"sslmode={binding['sslmode']}")
    binding['password'] = ''
    return environment, dsn


def units(workers):
    result = [PORTAL_UNIT, API_UNIT, *(w['unit'] for w in workers)]
    if any(w['state'] != 'active' for w in workers) or \
            any(subprocess.run(('systemctl', 'is-active', '--quiet', unit),
                               check=False).returncode for unit in result):
        raise ValueError('Every registered writer must be active')
    return result


def stop(units_to_stop):
    stopped = []
    try:
        for unit in units_to_stop:
            subprocess.run(('systemctl', 'stop', unit), check=True, timeout=75)
            stopped.append(unit)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        start(stopped)
        raise
    return stopped


def start(stopped):
    for unit in reversed(stopped):
        subprocess.run(('systemctl', 'start', unit), check=True, timeout=75)


def sql_statements(release_id, up_hash, down_hash, operation):
    preamble = ('SET LOCAL ROLE governance_migrations; '
                f'CREATE TABLE IF NOT EXISTS {TABLE} ('
                'release_id text PRIMARY KEY, up_sha256 text NOT NULL, '
                'down_sha256 text NOT NULL, applied_at timestamptz NOT NULL '
                'DEFAULT now()); '
                'SELECT pg_advisory_xact_lock(875690244); ')
    if operation == 'apply':
        preamble += (f"DO $$ BEGIN IF EXISTS (SELECT 1 FROM {TABLE} "
                     f"WHERE release_id = '{release_id}') THEN "
                     "RAISE EXCEPTION 'Release already applied'; END IF; END $$;")
        postamble = (f"INSERT INTO {TABLE} (release_id, up_sha256, down_sha256) "
                     f"VALUES ('{release_id}', '{up_hash}', '{down_hash}');")
    else:
        preamble += (f"DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM {TABLE} "
                     f"WHERE release_id = '{release_id}' AND "
                     f"up_sha256 = '{up_hash}' AND "
                     f"down_sha256 = '{down_hash}') THEN "
                     "RAISE EXCEPTION 'Release record mismatch'; END IF; END $$;")
        postamble = f"DELETE FROM {TABLE} WHERE release_id = '{release_id}';"
    return preamble, postamble


def run_migration(sql, release_id, up_hash, down_hash, operation, environment, dsn):
    preamble, postamble = sql_statements(release_id, up_hash, down_hash, operation)
    result = subprocess.run((PSQL, '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
                             '--single-transaction', '-d', dsn, '-c', preamble,
                             '-f', str(sql), '-c', postamble),
                            env=environment, capture_output=True, text=True,
                            timeout=180, check=False)
    if result.returncode:
        raise RuntimeError('Database transaction failed; inspect protected diagnostics')


def check_runtime():
    for _ in range(10):
        try:
            result = subprocess.run(('python3', HEALTH), capture_output=True,
                                    text=True, check=True, timeout=35)
            if json.loads(result.stdout).get('healthy') is True:
                return True
        except (OSError, ValueError, subprocess.CalledProcessError,
                subprocess.TimeoutExpired):
            pass
        time.sleep(2)
    return False


def execute(operation, up, down, up_hash, down_hash, release_id, workers):
    if not re.fullmatch(r'[a-z0-9][a-z0-9-]{0,63}', release_id):
        raise ValueError('Invalid release ID')
    verify_sql(up, up_hash)
    verify_sql(down, down_hash)
    check_backup()
    environment, dsn = database_connection()
    stopped = stop(units(workers))
    applied = False
    try:
        run_migration(up if operation == 'apply' else down, release_id,
                      up_hash, down_hash, operation, environment, dsn)
        applied = True
        start(stopped)
        if not check_runtime():
            raise RuntimeError('Hosted health failed after database transaction')
    except (OSError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired):
        if applied and operation == 'apply':
            for unit in stopped:
                subprocess.run(('systemctl', 'stop', unit), check=False, timeout=75)
            run_migration(down, release_id, up_hash, down_hash,
                          'rollback', environment, dsn)
        elif applied and operation == 'rollback':
            for unit in stopped:
                subprocess.run(('systemctl', 'stop', unit), check=False, timeout=75)
            run_migration(up, release_id, up_hash, down_hash,
                          'apply', environment, dsn)
        start(stopped)
        raise
    finally:
        environment.pop('PGPASSWORD', None)
    print('pilot_database_release=' + operation + ';release_id=' + release_id)


def main():
    import fcntl
    from pilot_worker_registry import LOCK as WORKER_LOCK, load_registry
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('operation', choices=('apply', 'rollback'))
    parser.add_argument('--up', type=pathlib.Path, required=True)
    parser.add_argument('--up-sha256', required=True)
    parser.add_argument('--down', type=pathlib.Path, required=True)
    parser.add_argument('--down-sha256', required=True)
    parser.add_argument('--release-id', required=True)
    args = parser.parse_args()
    if os.geteuid() != 0:
        raise ValueError('Root required')
    with LOCK.open('a') as own, (BACKUP / 'backup.lock').open('a') as backup, \
            WORKER_LOCK.open('a') as registry:
        for handle in (own, backup, registry):
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        execute(args.operation, args.up, args.down, args.up_sha256,
                args.down_sha256, args.release_id, load_registry())


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, BlockingIOError):
        print('pilot_database_release=failed;review_protected_diagnostics=true')
        raise SystemExit(1) from None
