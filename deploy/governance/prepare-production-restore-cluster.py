#!/usr/bin/env python3
"""Create a manual-start loopback PostgreSQL cluster for closed restore drills."""

import argparse
import importlib.util
import os
import pathlib
import secrets
import socket
import subprocess


VERSION = '17'
CLUSTER = 'production-recovery'
PORT = 5441
ROOT = pathlib.Path('/etc/aichain/production/backup')
PASSWORD = ROOT / 'restore-admin-password'
PSQL = '/usr/lib/postgresql/17/bin/psql'
MODULE = pathlib.Path('/opt/aichain/governance-pilot-db-setup/apply-production-schema.py')


def run(*args, input=None):
    result = subprocess.run(args, input=input, capture_output=True, text=True,
                            timeout=90, check=False)
    if result.returncode:
        raise ValueError('Closed restore cluster operation failed')
    return result.stdout.strip()


def preflight():
    if os.geteuid() != 0 or PASSWORD.exists() or PASSWORD.is_symlink():
        raise ValueError('Root and absent recovery credential required')
    with socket.socket() as probe:
        probe.settimeout(1)
        if probe.connect_ex(('127.0.0.1', PORT)) == 0:
            raise ValueError('Recovery port is already in use')
    clusters = run('pg_lsclusters', '-h')
    if not any(line.split()[:3] == ['17', 'main', '5433'] for line in clusters.splitlines()):
        raise ValueError('Existing pilot PostgreSQL 17 cluster not found')
    if not ROOT.is_dir():
        raise ValueError('Protected production backup root required')
    existing = pathlib.Path('/etc/postgresql/17/production-recovery')
    if existing.exists():
        if not existing.is_dir() or existing.is_symlink() or \
                not any(line.split()[:4] == ['17', CLUSTER, '5441', 'down']
                        for line in clusters.splitlines()) or \
                (existing / 'start.conf').read_text(encoding='ascii').strip().splitlines()[-1] != 'manual' or \
                run('pg_conftool', VERSION, CLUSTER, 'show', 'listen_addresses') not in \
                ('listen_addresses = 127.0.0.1', "listen_addresses = '127.0.0.1'"):
            raise ValueError('Existing recovery cluster is not the exact paused setup')
        return True
    return False


def install(resume):
    spec = importlib.util.spec_from_file_location('production_schema', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    secret = secrets.token_hex(32)
    verifier = module.scram_verifier(secret)
    if not resume:
        run('pg_createcluster', VERSION, CLUSTER, '--port=5441', '--start-conf=manual')
    run('pg_conftool', VERSION, CLUSTER, 'set', 'listen_addresses', "'127.0.0.1'")
    # The distro systemd template cannot expand a hyphenated cluster name.
    # Direct pg_ctlcluster control keeps this manual-start drill isolated.
    run('pg_ctlcluster', '--skip-systemctl-redirect', VERSION, CLUSTER, 'start')
    run('runuser', '-u', 'postgres', '--', PSQL, '-X', '-q', '-v', 'ON_ERROR_STOP=1',
        '-p', str(PORT), '-d', 'postgres', input=f"ALTER ROLE postgres PASSWORD '{verifier}';\n")
    fd = os.open(PASSWORD, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='ascii') as handle:
        handle.write(secret + '\n')
        handle.flush()
        os.fsync(handle.fileno())
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment['PGPASSWORD'] = secret
    verified = subprocess.run((PSQL, '-X', '-q', '-t', '-A', '-w', '-h', '127.0.0.1',
                               '-p', str(PORT), '-U', 'postgres', '-d', 'postgres',
                               '-c', "SELECT current_database() || '|' || current_user;"),
                              env=environment, capture_output=True, text=True,
                              timeout=15, check=False)
    environment['PGPASSWORD'] = ''
    if verified.returncode or verified.stdout.strip() != 'postgres|postgres':
        raise ValueError('Closed restore cluster login failed')
    print('production_restore_cluster=ready;port=5441;loopback_only=true;'
          'start=manual;pilot_cluster=unchanged')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    resume = preflight()
    if args.apply:
        install(resume)
    else:
        print('production_restore_cluster=' + ('ready_to_resume' if resume else 'ready_to_create') +
              ';mode=read-only;port=5441')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Closed production restore cluster setup failed; no secret printed') from None
