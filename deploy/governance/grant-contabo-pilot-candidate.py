#!/usr/bin/env python3
"""Apply reviewed runtime grants to the closed local pilot rehearsal copy."""

import json
import os
import pathlib
import stat
import subprocess


ROOT = pathlib.Path('/var/lib/aichain-pilot-db-migration')
SECRETS = ROOT / 'candidate-roles.json'
SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
PSQL = '/usr/lib/postgresql/17/bin/psql'


def call(role, password, *args):
    env = os.environ.copy()
    env.update(PGPASSWORD=password, PGSSLMODE='disable')
    result = subprocess.run((PSQL, '-X', '-q', '-v', 'ON_ERROR_STOP=1',
                             '-h', '127.0.0.1', '-p', '5433', '-U', role,
                             '-d', 'governance_test_candidate', *args),
                            env=env, capture_output=True, text=True, timeout=30)
    if result.returncode:
        raise RuntimeError('Candidate grant or role check failed')
    return result.stdout.strip()


def main():
    info = SECRETS.lstat()
    if os.geteuid() != 0 or not stat.S_ISREG(info.st_mode) or \
            info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise RuntimeError('Protected candidate role file required')
    passwords = json.loads(SECRETS.read_text(encoding='utf-8'))
    for filename in ('postgres-api-grants.sql', 'postgres-evidence-worker-grants.sql'):
        path = SETUP / filename
        if not path.is_file():
            raise RuntimeError('Reviewed grant script missing')
        call('governance_migrations', passwords['governance_migrations'], '-f', str(path))
    for role, table in (('governance_api', 'governance_customer_projects'),
                        ('governance_evidence_worker', 'governance_outbox')):
        actual = call(role, passwords[role], '-t', '-A', '-c',
                      f'SELECT count(*) FROM {table}')
        if not actual.isdigit():
            raise RuntimeError('Runtime role query did not return a count')
    print('Candidate API and worker runtime grants: VERIFIED')
    print('Scope: closed rehearsal database; no live service connection changed')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Candidate runtime grant verification failed') from None
