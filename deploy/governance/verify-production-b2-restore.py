#!/usr/bin/env python3
"""Download and authenticate one B2 set, then restore it to a closed local DB."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile
from production_restore_service_state import require_closed_restore_services


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RUNNER = pathlib.Path('/opt/aichain/orvessian-production-backup-runner-8285df6')
ROOT = pathlib.Path('/etc/aichain/production/backup')
KEY = ROOT / 'backup.key'
RESTORE = ROOT / 'b2-restore-credentials.json'
ADMIN = ROOT / 'restore-admin-password'
LATEST = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
DOWNLOADS = pathlib.Path('/var/lib/aichain-production-backup/downloads')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
BUCKET = 'orvessian-prod-backups-2026'
ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'
REGION = 'eu-central-003'
MODULE = SETUP / 'apply-production-schema.py'
CLOSED = SETUP / 'restore-production-backup-closed.py'


def import_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def preflight(backup_id):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9-]{36}', backup_id):
        raise ValueError('Root and exact production backup ID required')
    schema = import_module('production_schema', MODULE)
    if not re.fullmatch(r'[a-f0-9]{64}', schema.protected(KEY, 65)) or \
            not re.fullmatch(r'[a-f0-9]{64}', schema.protected(ADMIN, 1025)):
        raise ValueError('Protected archive and recovery keys required')
    credential = json.loads(schema.protected(RESTORE, 4096))
    if not isinstance(credential, dict) or set(credential) != {'accessKeyId', 'secretAccessKey'} or \
            not re.fullmatch(r'[A-Za-z0-9]{12,64}', credential['accessKeyId']) or \
            not re.fullmatch(r'[!-~]{20,128}', credential['secretAccessKey']):
        raise ValueError('Protected production restore credential required')
    credential = None
    pointer = json.loads(schema.protected(LATEST, 4096))
    if not isinstance(pointer, dict) or set(pointer) != {
            'version', 'environment', 'bucket', 'keyPrefix', 'journalRoles'} or \
            pointer['version'] != 2 or pointer['environment'] != 'prod' or \
            pointer['bucket'] != BUCKET or pointer['journalRoles'] != [] or \
            not re.fullmatch(r'orvessian-production/prod/' + re.escape(backup_id) +
                             r'-[a-f0-9-]{36}', pointer['keyPrefix']):
        raise ValueError('Production B2 completion pointer mismatch')
    clusters = subprocess.run(('pg_lsclusters', '-h'), capture_output=True,
                              text=True, timeout=15, check=False)
    if clusters.returncode or not any(line.split()[:4] ==
                                      ['17', 'production-recovery', '5441', 'online']
                                      for line in clusters.stdout.splitlines()):
        raise ValueError('Closed loopback recovery cluster required')
    require_closed_restore_services()
    if not (RUNNER / 'scripts/governance-backup-object-storage.cjs').is_file() or \
            not CLOSED.is_file():
        raise ValueError('Pinned transfer and closed restore runners required')
    return pointer['keyPrefix']


def private_json(directory, name, value):
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return path


def download_and_restore(backup_id, key_prefix, *, expected_workers=None,
                         chain=None, runner=RUNNER):
    workers = expected_workers or []
    roles = [worker['role'] for worker in workers]
    DOWNLOADS.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = DOWNLOADS.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Protected B2 download root required')
    with tempfile.TemporaryDirectory(prefix='production-b2-restore-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        config = private_json(private, 'download.json', {
            'environment': 'prod', 'bucket': BUCKET, 'keyPrefix': key_prefix,
            'outputRoot': str(DOWNLOADS), 'endpoint': ENDPOINT, 'region': REGION,
            'credentialsFile': str(RESTORE), 'keyFile': str(KEY),
        })
        result = subprocess.run((NODE, 'scripts/governance-backup-object-storage.cjs',
                                 'download', str(config)), cwd=runner,
                                capture_output=True, text=True, timeout=300, check=False)
        if result.returncode:
            raise ValueError('B2 download or authentication failed')
        downloaded = json.loads(result.stdout)
        directory = pathlib.Path(downloaded.get('directory', ''))
        if downloaded.get('operation') != 'download' or \
                downloaded.get('environment') != 'prod' or \
                downloaded.get('id') != backup_id or \
                downloaded.get('integrity') != 'verified' or \
                downloaded.get('journalRoles') != roles or \
                directory.parent != DOWNLOADS or directory.is_symlink() or \
                not directory.is_dir():
            raise ValueError('Authenticated production download state mismatch')
        print('production_b2_download=authenticated;backup_id=' + backup_id,
              flush=True)
        closed = import_module('production_closed_restore', CLOSED)
        admin = import_module('production_schema_closed', MODULE).protected(ADMIN, 1025)
        closed.restore(directory, admin, backup_id,
                       expected_workers=workers, chain=chain, runner=runner)
        print('production_b2_restore=review_passed;bucket=' + BUCKET +
              ';source_managed_database=untouched;service=off')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    key_prefix = preflight(args.backup_id)
    if args.apply:
        download_and_restore(args.backup_id, key_prefix)
    else:
        print('production_b2_restore=ready;mode=read-only;bucket=' + BUCKET)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production B2 restore failed; no secret printed; '
                         'no service activated') from None
