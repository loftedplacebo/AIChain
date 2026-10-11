#!/usr/bin/env python3
"""Exercise encrypted backup of the closed local pilot rehearsal database."""

import json
import os
import pathlib
import secrets
import stat
import subprocess
import tempfile

ROOT = pathlib.Path('/var/lib/aichain-pilot-db-migration')
ADMIN_PASSWORD = ROOT / 'local-postgres-password'
BACKUP_KEY = pathlib.Path('/etc/aichain/pilot-backup/backup.key')
RUNNER = pathlib.Path('/opt/aichain/pilot-backup-runner')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
PSQL = '/usr/lib/postgresql/17/bin/psql'


def main():
    if os.geteuid() != 0 or not ROOT.is_dir():
        raise RuntimeError('Protected root-only rehearsal required')
    if ADMIN_PASSWORD.exists():
        info = ADMIN_PASSWORD.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != 0o600:
            raise RuntimeError('Protected local administrator password required')
        password = ADMIN_PASSWORD.read_text(encoding='utf-8').strip()
    else:
        password = secrets.token_hex(32)
        result = subprocess.run(('runuser', '-u', 'postgres', '--', PSQL, '-X', '-q',
                                 '-v', 'ON_ERROR_STOP=1', '-p', '5433', '-d', 'postgres'),
                                input=f"ALTER ROLE postgres PASSWORD '{password}';\n",
                                capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError('Could not set local PostgreSQL 17 administrator password')
        fd = os.open(ADMIN_PASSWORD, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(password + '\n')
            handle.flush()
            os.fsync(handle.fileno())
    if not BACKUP_KEY.is_file():
        raise RuntimeError('Existing pilot encryption key required')
    archives = ROOT / 'encrypted-archives'
    archives.mkdir(mode=0o700, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='closed-pilot-backup-', dir='/run') as temporary:
        folder = pathlib.Path(temporary)
        os.chmod(folder, 0o700)
        connection = folder / 'connection.json'
        config = folder / 'capture.json'
        for path, value in ((connection, {'host': '127.0.0.1', 'port': 5433,
                                          'database': 'governance_test_candidate',
                                          'user': 'postgres', 'password': password}),
                            (config, {'environment': 'test', 'connectionFile': str(connection),
                                      'binaries': '/usr/lib/postgresql/17/bin',
                                      'journals': [], 'outputRoot': str(archives),
                                      'keyFile': str(BACKUP_KEY), 'consistency': 'quiesced'})):
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                json.dump(value, handle)
                handle.write('\n')
        password = ''
        result = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                 'backup', str(config)), cwd=RUNNER,
                                capture_output=True, text=True, timeout=180)
        if result.returncode:
            raise RuntimeError('Encrypted closed candidate capture failed')
        output = json.loads(result.stdout)
        if output.get('operation') != 'backup' or output.get('journalRoles') != []:
            raise RuntimeError('Unexpected closed candidate capture result')
        print('Closed candidate encrypted PostgreSQL capture: VERIFIED')
        print('Archive ID:', output['id'])
        print('Live journals and off-host upload: NOT INCLUDED IN THIS REHEARSAL')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, KeyError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Closed candidate encrypted backup rehearsal failed') from None
