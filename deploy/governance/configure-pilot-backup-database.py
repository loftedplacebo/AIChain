#!/usr/bin/env python3
"""Legacy managed-profile backup credential setup for explicit rollback only."""

import getpass
import json
import os
import pathlib
import stat
import subprocess
import tempfile
from pilot_db_binding import BINDING


ROOT = pathlib.Path('/etc/aichain/pilot-backup')
DESTINATION = ROOT / 'database-password'
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    if BINDING.exists() or BINDING.is_symlink():
        info = BINDING.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != 0o600:
            raise SystemExit('Protected managed pilot binding required')
        current = json.loads(BINDING.read_text(encoding='utf-8'))
        if not isinstance(current, dict) or current.get('profile') != 'managed':
            raise SystemExit('Managed backup credential setup is disabled for the local pilot')
    password = getpass.getpass('1Password doadmin database password for daily backups: ')
    if not password or len(password) > 1024 or '\n' in password or '\r' in password:
        raise SystemExit('Invalid database credential; nothing installed')
    environment = os.environ.copy()
    environment['PGPASSWORD'] = password
    result = subprocess.run((
        '/usr/lib/postgresql/17/bin/psql', '-X', '-q', '-t', '-A',
        f'host={HOST} port=25060 dbname=governance_test user=doadmin '
        'sslmode=verify-full '
        'sslrootcert=/etc/aichain/governance/digitalocean-ca.crt',
        '-c', 'SELECT current_user',
    ), env=environment, capture_output=True, text=True, timeout=30)
    environment['PGPASSWORD'] = ''
    if result.returncode != 0 or result.stdout.strip() != 'doadmin':
        raise SystemExit('Database credential verification failed; nothing installed')
    fd, temporary = tempfile.mkstemp(prefix='.database-password-', dir=ROOT)
    try:
        os.fchmod(fd, stat.S_IRUSR | stat.S_IWUSR)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(password + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DESTINATION)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Daily backup database credential verified and installed root-only.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, json.JSONDecodeError, subprocess.TimeoutExpired):
        raise SystemExit('Daily backup credential setup failed; check server diagnostics') from None
