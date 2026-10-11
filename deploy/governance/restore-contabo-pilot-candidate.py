#!/usr/bin/env python3
"""Restore the closed encrypted Contabo pilot rehearsal into a new closed DB."""

import json
import os
import pathlib
import stat
import subprocess
import tempfile

ROOT = pathlib.Path('/var/lib/aichain-pilot-db-migration')
PASSWORD = ROOT / 'local-postgres-password'
BACKUP_KEY = pathlib.Path('/etc/aichain/pilot-backup/backup.key')
RUNNER = pathlib.Path('/opt/aichain/pilot-backup-runner')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
TARGET = 'gov_restore_contabo_rehearsal'


def main():
    info = PASSWORD.lstat()
    if os.geteuid() != 0 or not stat.S_ISREG(info.st_mode) or \
            info.st_uid != 0 or stat.S_IMODE(info.st_mode) != 0o600:
        raise RuntimeError('Protected local administrator password required')
    archives = list((ROOT / 'encrypted-archives').glob('pg-backup-*'))
    if len(archives) != 1 or not (archives[0] / 'complete.json').is_file():
        raise RuntimeError('Exactly one completed closed archive required')
    with tempfile.TemporaryDirectory(prefix='closed-pilot-restore-', dir='/run') as temporary:
        folder = pathlib.Path(temporary)
        os.chmod(folder, 0o700)
        connection = folder / 'connection.json'
        config = folder / 'restore.json'
        for path, value in ((connection, {'host': '127.0.0.1', 'port': 5433,
                                          'database': 'postgres', 'user': 'postgres',
                                          'password': PASSWORD.read_text(encoding='utf-8').strip()}),
                            (config, {'environment': 'test', 'connectionFile': str(connection),
                                      'binaries': '/usr/lib/postgresql/17/bin',
                                      'directory': str(archives[0]),
                                      'outputRoot': str(ROOT / 'restore-results'),
                                      'keyFile': str(BACKUP_KEY), 'targetDatabase': TARGET,
                                      'approvedMigrations': []})):
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, 'w', encoding='utf-8') as handle:
                json.dump(value, handle)
                handle.write('\n')
        (ROOT / 'restore-results').mkdir(mode=0o700, exist_ok=True)
        result = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs',
                                 'restore', str(config)), cwd=RUNNER,
                                capture_output=True, text=True, timeout=180)
        if result.returncode:
            raise RuntimeError('Closed candidate restore failed')
        output = json.loads(result.stdout)
        if output.get('targetDatabase') != TARGET or output.get('access') != 'revoked-and-disabled' or \
                output.get('activation') != 'review-required':
            raise RuntimeError('Closed restore state differs from review requirements')
        print('Closed local PostgreSQL restore: VERIFIED')
        print('Target:', TARGET)
        print('Restored access: REVOKED AND DISABLED')


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, KeyError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Closed local pilot restore rehearsal failed') from None
