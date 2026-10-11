#!/usr/bin/env python3
"""Verify a rotated doadmin password and store it for production operations."""

import getpass
import os
import pathlib
import stat
import subprocess
import tempfile


ROOT = pathlib.Path('/etc/aichain/production')
DESTINATION = ROOT / 'database-admin-password'
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
PSQL = '/usr/lib/postgresql/17/bin/psql'


def verify(password):
    if not CA.is_file() or CA.is_symlink():
        raise ValueError('Verified managed-database CA required')
    environment = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
    environment.update(PGPASSWORD=password, PGCONNECT_TIMEOUT='5')
    dsn = (f'host={HOST} port=25060 dbname=governance_prod user=doadmin '
           f'sslmode=verify-full sslrootcert={CA}')
    try:
        result = subprocess.run((PSQL, '-X', '-q', '-t', '-A', '-w',
                                 '-v', 'ON_ERROR_STOP=1', '-d', dsn,
                                 '-c', 'SELECT current_user, current_database()'),
                                env=environment, text=True, capture_output=True,
                                timeout=30, check=False)
        if result.returncode or result.stdout.strip() != 'doadmin|governance_prod':
            raise ValueError('Rotated production administrator credential did not verify')
    finally:
        environment['PGPASSWORD'] = ''


def main():
    if os.geteuid() != 0:
        raise ValueError('Run as root on the Contabo VPS')
    if ROOT.exists():
        info = ROOT.lstat()
        if not stat.S_ISDIR(info.st_mode) or (os.name == 'posix' and
                                              (info.st_uid != 0 or info.st_mode & 0o077)):
            raise ValueError('Protected production directory required')
    else:
        ROOT.mkdir(mode=0o700)
    password = getpass.getpass('Rotated DigitalOcean doadmin password: ')
    if not 12 <= len(password) <= 1024 or '\n' in password or '\r' in password:
        raise ValueError('Invalid production administrator credential')
    verify(password)
    fd, temporary = tempfile.mkstemp(prefix='.database-admin-', dir=ROOT)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(password + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DESTINATION)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Production database administrator credential verified and stored root-only.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Production database administrator installation failed; no secret printed') from None
