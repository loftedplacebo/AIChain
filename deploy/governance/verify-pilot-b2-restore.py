#!/usr/bin/env python3
"""Download the completed B2 set and restore it to a fresh, closed test DB."""

import getpass
import json
import os
import pathlib
import re
import secrets
import subprocess
import tempfile
import time


ROOT = pathlib.Path('/etc/aichain/pilot-backup')
RUNNER = pathlib.Path('/opt/aichain/pilot-backup-runner')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
BASE = pathlib.Path('/var/lib/aichain-pilot-backup')


def write_json(directory: pathlib.Path, name: str, value: dict) -> pathlib.Path:
    file = directory / name
    fd = os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return file


def run(script: str, operation: str, config: pathlib.Path,
        timeout: int = 600) -> dict:
    environment = os.environ.copy()
    environment['ORVESSIAN_BACKUP_DIAGNOSTIC'] = '1'
    result = subprocess.run((NODE, script, operation, str(config)),
                            check=False, text=True, capture_output=True,
                            cwd=RUNNER, timeout=timeout, env=environment)
    if result.returncode:
        for line in result.stderr.splitlines():
            if line.startswith('Safe diagnostic: '):
                print(f'{operation}: {line}', flush=True)
        raise subprocess.CalledProcessError(result.returncode, result.args)
    value = json.loads(result.stdout)
    if value.get('operation') != operation:
        raise ValueError('Unexpected backup operation response')
    return value


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    pointer = json.loads((ROOT / 'latest-upload.json').read_text(encoding='utf-8'))
    key_prefix = pointer.get('keyPrefix')
    if pointer.get('version') != 1 or pointer.get('environment') != 'test' or \
            pointer.get('bucket') != 'orvessian-pilot-test-backups' or \
            not isinstance(key_prefix, str) or \
            not re.fullmatch(r'orvessian-pilot/test/[a-f0-9-]{73}', key_prefix):
        raise SystemExit('No valid completed pilot B2 upload pointer')

    key_id = input('1Password B2 restore keyID: ').strip()
    secret = getpass.getpass('1Password B2 restore applicationKey: ').strip()
    password = getpass.getpass('1Password doadmin database password (one-time use): ')
    if not re.fullmatch(r'[A-Za-z0-9]{12,64}', key_id) or \
            not re.fullmatch(r'[!-~]{20,128}', secret) or \
            not password or len(password) > 1024:
        raise SystemExit('Invalid credential input; no restore attempted')

    started = time.monotonic()

    for name in ('downloads', 'restores'):
        (BASE / name).mkdir(mode=0o700, parents=True, exist_ok=True)
        os.chmod(BASE / name, 0o700)

    with tempfile.TemporaryDirectory(prefix='pilot-restore-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        credentials = write_json(private, 'b2-restore.json', {
            'accessKeyId': key_id, 'secretAccessKey': secret,
        })
        discovery = write_json(private, 'discover.json', {
            'environment': 'test', 'bucket': 'orvessian-pilot-test-backups',
            'prefix': 'orvessian-pilot',
            'endpoint': 'https://s3.eu-central-003.backblazeb2.com',
            'region': 'eu-central-003', 'credentialsFile': str(credentials),
        })
        print('Checking B2 completion marker visibility.', flush=True)
        candidates = run('scripts/governance-backup-object-storage.cjs',
                         'discover', discovery)
        if key_prefix not in candidates.get('candidates', []):
            raise SystemExit('Completed B2 set was not discoverable')
        print('Completed B2 set: DISCOVERABLE', flush=True)
        discovered_at = time.monotonic()
        connection = write_json(private, 'do-admin.json', {
            'host': 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com',
            'port': 25060, 'database': 'defaultdb', 'user': 'doadmin',
            'password': password, 'sslmode': 'verify-full',
            'caFile': '/etc/aichain/governance/digitalocean-ca.crt',
        })
        password = ''
        transfer = write_json(private, 'download.json', {
            'environment': 'test', 'bucket': 'orvessian-pilot-test-backups',
            'keyPrefix': key_prefix, 'outputRoot': str(BASE / 'downloads'),
            'endpoint': 'https://s3.eu-central-003.backblazeb2.com',
            'region': 'eu-central-003', 'credentialsFile': str(credentials),
            'keyFile': str(ROOT / 'backup.key'),
        })
        print('Downloading and authenticating B2 archive.', flush=True)
        downloaded = run('scripts/governance-backup-object-storage.cjs',
                         'download', transfer)
        if downloaded.get('integrity') != 'verified' or \
                not isinstance(downloaded.get('directory'), str):
            raise SystemExit('Downloaded backup was not authenticated')
        print('B2 download and archive authentication: VERIFIED', flush=True)
        downloaded_at = time.monotonic()

        target = 'gov_restore_b2_' + secrets.token_hex(6)
        restore = write_json(private, 'restore.json', {
            'environment': 'test', 'connectionFile': str(connection),
            'binaries': '/usr/lib/postgresql/17/bin',
            'directory': downloaded['directory'],
            'outputRoot': str(BASE / 'restores'),
            'keyFile': str(ROOT / 'backup.key'),
            'targetDatabase': target,
        })
        print('Restoring authenticated archive into a new closed database.', flush=True)
        restored = run('scripts/governance-postgres-recovery.cjs',
                       'restore', restore)
        if restored.get('targetDatabase') != target or \
                restored.get('activation') != 'review-required' or \
                restored.get('access') != 'revoked-and-disabled':
            raise SystemExit('Fresh restore did not remain closed')
        if 'worker' not in restored.get('journalRoles', []):
            raise SystemExit('Hosted evidence worker journal missing from B2 restore')

        review_connection = json.loads(connection.read_text(encoding='utf-8'))
        review_connection['database'] = target
        review_connection_file = write_json(private, 'review-db.json', review_connection)
        review = write_json(private, 'review.json', {
            'environment': 'test', 'connectionFile': str(review_connection_file),
            'binaries': '/usr/lib/postgresql/17/bin',
            'directory': restored['directory'],
        })
        run('scripts/governance-postgres-recovery.cjs', 'review', review)
        print('Fresh hosted-pilot PostgreSQL restore: REVIEW PASSED')
        print('Hosted evidence worker journal: RESTORED AND CLOSED')
        print('Restored database:', target)
        print('Restored access: REVOKED AND CLOSED')
        print('Backup ID:', downloaded.get('id'))
        print('Timed drill discovery seconds:', round(discovered_at - started, 2))
        print('Timed drill B2 download and authentication seconds:',
              round(downloaded_at - discovered_at, 2))
        print('Timed drill fresh restore and review seconds:',
              round(time.monotonic() - downloaded_at, 2))
        print('Timed drill total seconds:', round(time.monotonic() - started, 2))
        print('Drill scope: same DigitalOcean cluster; no service activation')


if __name__ == '__main__':
    try:
        main()
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired,
            ValueError, KeyError):
        print('B2 download or fresh restore failed; no restored service was activated.')
        raise SystemExit(1) from None
