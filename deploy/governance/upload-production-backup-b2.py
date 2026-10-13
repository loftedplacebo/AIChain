#!/usr/bin/env python3
"""Upload one authenticated production archive to its private B2 bucket."""

import argparse
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import tempfile


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RUNNER = pathlib.Path('/opt/aichain/orvessian-production-backup-runner-8285df6')
ROOT = pathlib.Path('/etc/aichain/production/backup')
KEY = ROOT / 'backup.key'
UPLOAD = ROOT / 'b2-upload-credentials.json'
ARCHIVES = pathlib.Path('/var/lib/aichain-production-backup/archives')
LATEST = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
BUCKET = 'orvessian-prod-backups-2026'
PREFIX = 'orvessian-production'
ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'
REGION = 'eu-central-003'
MODULE = SETUP / 'apply-production-schema.py'


def schema_module():
    spec = importlib.util.spec_from_file_location('production_schema', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_archive(backup_id):
    found = []
    for directory in ARCHIVES.glob('pg-backup-*'):
        if not directory.is_dir() or directory.is_symlink():
            continue
        marker = directory / 'complete.json'
        if not marker.is_file() or marker.is_symlink() or marker.stat().st_size > 4096:
            continue
        value = json.loads(marker.read_text(encoding='utf-8'))
        if value.get('id') == backup_id and value.get('environment') == 'prod':
            found.append(directory)
    if len(found) != 1:
        raise ValueError('Exactly one matching production archive required')
    return found[0]


def preflight(backup_id):
    if os.geteuid() != 0 or not re.fullmatch(r'[a-f0-9-]{36}', backup_id):
        raise ValueError('Root and exact production backup ID required')
    module = schema_module()
    if not re.fullmatch(r'[a-f0-9]{64}', module.protected(KEY, 65)):
        raise ValueError('Protected production archive key required')
    credential = json.loads(module.protected(UPLOAD, 4096))
    if not isinstance(credential, dict) or set(credential) != {'accessKeyId', 'secretAccessKey'} or \
            not re.fullmatch(r'[A-Za-z0-9]{12,64}', credential['accessKeyId']) or \
            not re.fullmatch(r'[!-~]{20,128}', credential['secretAccessKey']):
        raise ValueError('Protected production upload credential required')
    credential = None
    if not (RUNNER / 'scripts/governance-backup-object-storage.cjs').is_file():
        raise ValueError('Isolated production backup runner required')
    if LATEST.exists() or LATEST.is_symlink():
        raise ValueError('Existing production B2 pointer requires review')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          capture_output=True, text=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled')
    return source_archive(backup_id)


def upload(directory, backup_id):
    with tempfile.TemporaryDirectory(prefix='production-b2-upload-', dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        config = private / 'upload.json'
        fd = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump({'environment': 'prod', 'directory': str(directory),
                       'bucket': BUCKET, 'prefix': PREFIX, 'endpoint': ENDPOINT,
                       'region': REGION, 'credentialsFile': str(UPLOAD),
                       'keyFile': str(KEY), 'latestFile': str(LATEST)}, handle)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        result = subprocess.run((NODE, 'scripts/governance-backup-object-storage.cjs',
                                 'upload', str(config)), cwd=RUNNER,
                                capture_output=True, text=True, timeout=300, check=False)
        if result.returncode:
            raise ValueError('Production B2 upload failed')
        uploaded = json.loads(result.stdout)
        if uploaded.get('operation') != 'upload' or uploaded.get('environment') != 'prod' or \
                uploaded.get('bucket') != BUCKET or uploaded.get('id') != backup_id or \
                uploaded.get('journalRoles') != [] or \
                uploaded.get('upload') != 'complete-marker-written' or \
                not uploaded.get('keyPrefix', '').startswith(PREFIX + '/prod/'):
            raise ValueError('Production B2 upload state mismatch')
        print('production_b2_upload=complete_marker_written;'
              f'backup_id={backup_id};bucket={BUCKET};remote_restore=not_tested')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    directory = preflight(args.backup_id)
    if args.apply:
        upload(directory, args.backup_id)
    else:
        print('production_b2_upload=ready;mode=read-only;archive=' + directory.name)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production B2 upload failed; no secret printed; '
                         'no service activated') from None
