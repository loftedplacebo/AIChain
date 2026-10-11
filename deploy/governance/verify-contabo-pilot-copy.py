#!/usr/bin/env python3
"""Read-only aggregate comparison of managed pilot and closed local rehearsal."""

import os
import pathlib
import re
import stat
import subprocess

PG = '/usr/lib/postgresql/17/bin/psql'
PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
SOURCE = ['-h', 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com',
          '-p', '25060', '-U', 'doadmin', '-d', 'governance_test']
TARGET = ['runuser', '-u', 'postgres', '--', PG, '-p', '5433', '-d',
          'governance_test_candidate']


def query(target, sql):
    command = (TARGET if target else [PG, *SOURCE]) + ['-X', '-q', '-t', '-A',
                                                      '-v', 'ON_ERROR_STOP=1', '-c', sql]
    env = os.environ.copy()
    if not target:
        env.update(PGPASSWORD=PASSWORD.read_text(encoding='utf-8').rstrip('\n'),
                   PGSSLMODE='verify-full',
                   PGSSLROOTCERT='/etc/aichain/governance/digitalocean-ca.crt')
    result = subprocess.run(command, env=env, text=True, capture_output=True,
                            timeout=30)
    if result.returncode:
        raise RuntimeError('Protected aggregate query failed')
    return result.stdout.strip()


def main():
    info = PASSWORD.lstat()
    if os.geteuid() != 0 or not stat.S_ISREG(info.st_mode) or \
            info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise RuntimeError('Protected operator context required')
    tables = query(False, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    if not tables or any(not re.fullmatch(r'[a-z][a-z0-9_]*', name) for name in tables):
        raise RuntimeError('Unexpected source table inventory')
    local_tables = query(True, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    if tables != local_tables:
        raise RuntimeError('Source and local table inventory differ')
    differences = []
    for name in tables:
        sql = f'SELECT count(*) FROM public.{name}'
        source, local = int(query(False, sql)), int(query(True, sql))
        if source != local:
            differences.append((name, source, local))
    marker = query(True, 'SELECT name FROM public.governance_environment')
    if marker != 'test':
        raise RuntimeError('Local database environment marker is not test')
    print(f'table_inventory={len(tables)};same_count={len(tables)-len(differences)};different_count={len(differences)};marker=test')
    for name, source, local in differences:
        print(f'drift={name};managed_now={source};rehearsal_snapshot={local}')
    print('Scope: rehearsal snapshot only; final writer-paused cutover still required')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, subprocess.TimeoutExpired, ValueError):
        raise SystemExit('Protected pilot copy comparison failed') from None
