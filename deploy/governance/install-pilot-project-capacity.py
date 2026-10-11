#!/usr/bin/env python3
"""Install the local hosted-test five-project database boundary."""
import json
import os
import pathlib
import stat
import subprocess
import sys
from pilot_db_binding import load_admin, psql_environment

SQL = pathlib.Path('/opt/aichain/governance-pilot-db-setup/pilot-project-capacity.sql')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
CATALOG = '/opt/aichain/governance-pilot-api/scripts/check-pilot-project-inventory.cjs'


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    if sys.argv[1:] not in ([], ['--preflight']):
        raise ValueError('Usage: install-pilot-project-capacity.py [--preflight]')
    info = SQL.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or info.st_size > 8192:
        raise ValueError('Reviewed root-owned SQL required')
    result = subprocess.run((NODE, CATALOG), capture_output=True, text=True,
                            timeout=30, check=False)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    if result.returncode != 0 or len(lines) != 1:
        raise ValueError('Privileged project catalog unavailable')
    catalog = json.loads(lines[0])
    count = catalog.get('projects')
    if type(count) is not int or not 2 <= count <= 5 or \
            catalog.get('missingProjects') or catalog.get('staleWorkers'):
        raise ValueError('Project catalog must be fully reconciled within capacity')
    binding = load_admin()
    if binding['profile'] != 'contabo-local':
        raise ValueError('Pilot capacity installation requires the local Contabo profile')
    if sys.argv[1:] == ['--preflight']:
        print(f'pilot_project_capacity=preflight-ready;used={count};max=5;database=contabo-local')
        return
    environment = psql_environment(binding)
    dsn = (f"host={binding['host']} port={binding['port']} "
           f"dbname={binding['database']} user={binding['user']} "
           f"sslmode={binding['sslmode']}")
    binding['password'] = ''
    command = ('/usr/lib/postgresql/17/bin/psql', '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
               '-v', f'current_projects={count}', '-d', dsn, '-f', str(SQL))
    applied = subprocess.run(command, env=environment, capture_output=True,
                             text=True, timeout=60, check=False)
    if applied.returncode != 0:
        raise ValueError('Capacity transaction failed; no policy enabled')
    verification = subprocess.run(('/usr/lib/postgresql/17/bin/psql', '-X', '-q', '-At', '-w', '-v',
                                   'ON_ERROR_STOP=1', '-d', dsn, '-c',
                                   'SELECT used,max_projects FROM public.governance_pilot_project_capacity WHERE singleton'),
                                  env=environment, capture_output=True, text=True,
                                  timeout=30, check=False)
    environment.pop('PGPASSWORD', None)
    if verification.returncode != 0 or verification.stdout.strip() != f'{count}|5':
        raise ValueError('Capacity state verification failed')
    print(f'pilot_project_capacity=installed;used={count};max=5')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        print('Pilot project capacity installation failed; no credentials printed.')
        raise SystemExit(1) from None
