#!/usr/bin/env python3
"""Quiesce pilot writers, capture an encrypted test backup, then upload to B2."""

import fcntl
import json
import os
import pathlib
import subprocess
import sys
import tempfile
from pilot_worker_registry import LOCK, load_registry, verify_journal_binding
from pilot_db_binding import load_admin, recovery_connection


ROOT = pathlib.Path('/etc/aichain/pilot-backup')
RUNNER = pathlib.Path('/opt/aichain/pilot-backup-runner')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
ARCHIVES = pathlib.Path('/var/lib/aichain-pilot-backup/archives')
SERVICES = (
    'orvessian-pilot-portal.service',
    'aichain-governance-synthetic-api.service',
)


def write_json(directory: pathlib.Path, name: str, value: dict) -> pathlib.Path:
    file = directory / name
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return file


def run(*args: str, timeout: int = 300) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=True, text=True, capture_output=True,
                          timeout=timeout, cwd=RUNNER)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    if len(sys.argv) > 2 or len(sys.argv) == 2 and sys.argv[1] not in ('--scheduled', '--offline-cutover'):
        raise SystemExit('Usage: run-pilot-backup-once.py [--scheduled|--offline-cutover]')
    offline_cutover = sys.argv[1:] == ['--offline-cutover']
    lock_fd = os.open(ROOT / 'backup.lock', os.O_WRONLY | os.O_CREAT, 0o600)
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('Another pilot backup is already running') from None
    registry_fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    lock_info = os.fstat(registry_fd)
    if lock_info.st_uid != 0 or lock_info.st_mode & 0o077:
        raise SystemExit('Protected worker registry lock required')
    try:
        fcntl.flock(registry_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('Worker provisioning or activation is in progress') from None
    for required in (ROOT / 'backup.key', ROOT / 'b2-upload-credentials.json',
                     RUNNER / 'scripts/governance-postgres-recovery.cjs',
                     RUNNER / 'scripts/governance-backup-object-storage.cjs'):
        if not required.is_file():
            raise SystemExit(f'Missing backup prerequisite: {required}')
    workers = load_registry()
    for worker in workers:
        verify_journal_binding(worker)
        active = subprocess.run(('systemctl', 'is-active', '--quiet', worker['unit']),
                                check=False).returncode == 0
        if worker['state'] == 'active' and not active and not offline_cutover:
            raise SystemExit('Registered active worker unavailable: ' + worker['role'])
    ARCHIVES.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(ARCHIVES, 0o700)
    binding = load_admin()
    if offline_cutover and binding['profile'] != 'contabo-local':
        raise SystemExit('Offline cutover capture requires local pilot database binding')

    with tempfile.TemporaryDirectory(prefix='pilot-backup-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        connection = write_json(private, 'source.json', recovery_connection(binding))
        binding['password'] = ''
        capture = write_json(private, 'capture.json', {
            'environment': 'test', 'connectionFile': str(connection),
            'binaries': '/usr/lib/postgresql/17/bin',
            'journals': [{'role': worker['role'], 'path': worker['journal']}
                         for worker in workers],
            'outputRoot': str(ARCHIVES), 'keyFile': str(ROOT / 'backup.key'),
            'consistency': 'quiesced',
        })
        active = [service for service in (*SERVICES, *(w['unit'] for w in workers)) if subprocess.run(
            ('systemctl', 'is-active', '--quiet', service), check=False).returncode == 0]
        if offline_cutover and active:
            raise SystemExit('Offline cutover requires all pilot API, portal and worker writers stopped')
        stopped = []
        try:
            print('Pausing pilot writers for a coordinated encrypted capture.', flush=True)
            for service in active:
                stopped.append(service)
                subprocess.run(('systemctl', 'stop', service), check=True, timeout=45)
            result = json.loads(run(NODE, 'scripts/governance-postgres-recovery.cjs',
                                    'backup', str(capture)).stdout)
            if set(result.get('journalRoles', [])) != {w['role'] for w in workers}:
                raise ValueError('Backup omitted a registered worker journal')
        finally:
            restart_failures = []
            for service in reversed(stopped):
                try:
                    subprocess.run(('systemctl', 'start', service), check=True, timeout=45)
                except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
                    restart_failures.append(service)
            if restart_failures:
                raise SystemExit('Pilot writer restart failed: ' + ', '.join(restart_failures))
            print('Pilot writer services restarted.' if stopped else
                  'Pilot writer services remained stopped for cutover.', flush=True)
        directory = result.get('directory')
        if result.get('operation') != 'backup' or not isinstance(directory, str) or \
                not pathlib.Path(directory).is_dir():
            raise SystemExit('Backup command did not return a complete archive')
        print('Encrypted hosted-pilot PostgreSQL capture completed.', flush=True)
        transfer = write_json(private, 'upload.json', {
            'environment': 'test', 'directory': directory,
            'bucket': 'orvessian-pilot-test-backups', 'prefix': 'orvessian-pilot',
            'endpoint': 'https://s3.eu-central-003.backblazeb2.com',
            'region': 'eu-central-003',
            'credentialsFile': str(ROOT / 'b2-upload-credentials.json'),
            'keyFile': str(ROOT / 'backup.key'),
            'latestFile': str(ROOT / 'latest-upload.json'),
        })
        uploaded = json.loads(run(NODE, 'scripts/governance-backup-object-storage.cjs',
                                  'upload', str(transfer), timeout=600).stdout)
        if uploaded.get('operation') != 'upload' or uploaded.get('upload') != 'complete-marker-written':
            raise SystemExit('Remote completion marker was not confirmed')
        print('B2 encrypted upload completed.')
        print('Backup ID:', uploaded.get('id'))
        print('B2 key prefix:', uploaded.get('keyPrefix'))
        print('Remote restore: NOT YET TESTED')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired,
            ValueError, KeyError) as error:
        print('Pilot backup or upload failed; inspect protected server diagnostics. '
              'No restore or activation was attempted.')
        raise SystemExit(1) from None
