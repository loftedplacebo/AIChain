#!/usr/bin/env python3
"""Independently review an existing closed Contabo pilot B2 restore."""

import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile

from pilot_db_binding import load_admin, recovery_connection
from pilot_worker_registry import load_registry, verify_journal_binding


ROOT = pathlib.Path('/var/lib/aichain-pilot-backup/restores')
RUNNER = pathlib.Path('/opt/aichain/pilot-backup-runner')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'


def private_json(directory: pathlib.Path, name: str, value: dict) -> pathlib.Path:
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(value, stream)
        stream.write('\n')
    return path


def main() -> None:
    if os.geteuid() != 0 or len(sys.argv) != 2 or not re.fullmatch(r'pg-restore-[A-Za-z0-9]+', sys.argv[1]):
        raise ValueError('Root and one closed restore directory name required')
    directory = ROOT / sys.argv[1]
    if directory.is_symlink() or not directory.is_dir() or directory.stat().st_uid != 0:
        raise ValueError('Protected closed restore directory required')
    marker_file = directory / 'recovery.json'
    if marker_file.is_symlink() or not marker_file.is_file() or marker_file.stat().st_uid != 0:
        raise ValueError('Protected recovery marker required')
    marker = json.loads(marker_file.read_text(encoding='utf-8'))
    target = marker.get('targetDatabase')
    workers = load_registry()
    roles = {worker['role'] for worker in workers}
    if marker.get('environment') != 'test' or not re.fullmatch(r'gov_restore_b2_[a-f0-9]{12}', target or '') or \
            marker.get('access') != 'revoked-and-disabled' or marker.get('activation') != 'review-required' or \
            set(marker.get('journalRoles', [])) != roles:
        raise ValueError('Closed pilot B2 recovery marker does not match the worker registry')
    binding = load_admin()
    if binding['profile'] != 'contabo-local':
        raise ValueError('Local Contabo pilot database binding required')
    connection = recovery_connection(binding)
    connection['database'] = target
    with tempfile.TemporaryDirectory(prefix='closed-b2-review-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        connection_file = private_json(private, 'connection.json', connection)
        binding['password'] = ''
        connection['password'] = ''
        review_file = private_json(private, 'review.json', {
            'environment': 'test', 'connectionFile': str(connection_file),
            'binaries': '/usr/lib/postgresql/17/bin', 'directory': str(directory),
        })
        result = subprocess.run((NODE, 'scripts/governance-postgres-recovery.cjs', 'review', str(review_file)),
                                cwd=RUNNER, check=False, text=True, capture_output=True, timeout=180)
        if result.returncode:
            raise ValueError('Closed PostgreSQL recovery review failed')
        review = json.loads(result.stdout)
        if review.get('operation') != 'review' or set(review.get('journalRoles', [])) != roles:
            raise ValueError('Closed recovery review omitted registered worker journals')
    restored_journals = directory / marker['journalsDirectory']
    for worker in workers:
        verify_journal_binding({**worker, 'journal': str(restored_journals / (worker['role'] + '.sqlite'))})
    print('Independent local B2 restore review: PASSED')
    print('Restored database:', target)
    print('Registered worker journals:', len(roles))
    print('Restored access: REVOKED AND CLOSED')
    print('Backup ID:', marker['backupId'])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired):
        raise SystemExit('Independent local B2 restore review failed; no service was activated') from None
