#!/usr/bin/env python3
"""Quiesce the closed Production API, capture and upload a journal-free backup.

This runner is deliberately limited to the prelaunch database with zero
projects. It fails closed once projects or production workers exist; a reviewed
journal-aware runner must replace it before customer onboarding opens.
"""

import fcntl
import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile
import time


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
SCHEMA = SETUP / 'apply-production-schema.py'
RUNNER = pathlib.Path('/opt/aichain/orvessian-production-backup-runner-8285df6')
ROOT = pathlib.Path('/etc/aichain/production/backup')
ARCHIVES = pathlib.Path('/var/lib/aichain-production-backup/archives')
LATEST = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
API = 'orvessian-production-api.service'
PORTAL = 'orvessian-production-portal.service'
BUCKET = 'orvessian-prod-backups-2026'
ENDPOINT = 'https://s3.eu-central-003.backblazeb2.com'
REGION = 'eu-central-003'


def module():
    spec = importlib.util.spec_from_file_location('production_schema', SCHEMA)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value


def status(unit):
    result = subprocess.run(('systemctl', 'show', unit, '-p', 'UnitFileState',
                             '-p', 'ActiveState'), capture_output=True, text=True,
                            timeout=15, check=False)
    if result.returncode:
        raise ValueError('Production service status unavailable')
    return set(result.stdout.splitlines())


def run(*args, timeout=600):
    result = subprocess.run(args, capture_output=True, text=True,
                            timeout=timeout, check=False, cwd=RUNNER)
    if result.returncode:
        raise ValueError('Production backup phase failed')
    return result


def private_json(directory, name, value):
    path = directory / name
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as handle:
        json.dump(value, handle)
        handle.write('\n')
        handle.flush()
        os.fsync(handle.fileno())
    return path


def preflight(schema):
    if os.geteuid() != 0 or status(API) != {'UnitFileState=enabled',
                                           'ActiveState=active'} or \
            status(PORTAL) != {'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Closed Production API and portal state required')
    for path in (RUNNER / 'scripts/governance-postgres-recovery.cjs',
                 RUNNER / 'scripts/governance-backup-object-storage.cjs'):
        if not path.is_file():
            raise ValueError('Pinned production backup runner required')
    if not re.fullmatch(r'[a-f0-9]{64}', schema.protected(ROOT / 'backup.key', 65)):
        raise ValueError('Protected production archive key required')
    upload = json.loads(schema.protected(ROOT / 'b2-upload-credentials.json', 4096))
    if set(upload) != {'accessKeyId', 'secretAccessKey'}:
        raise ValueError('Protected production B2 upload credential required')
    upload = None
    admin = schema.protected(schema.ADMIN, 1025)
    if schema.psql('doadmin', admin, 'SELECT name FROM governance_environment;') != 'prod':
        raise ValueError('Production database marker mismatch')
    if schema.psql('doadmin', admin,
                   'SELECT count(*) FROM governance_customer_projects;') != '0':
        raise ValueError('Project exists; journal-aware Production backup required')
    for unit in ('orvessian-production-worker.service',
                 'orvessian-production-evidence-worker.service'):
        if status(unit) != {'UnitFileState=', 'ActiveState=inactive'}:
            raise ValueError('Production worker service requires reviewed journal coverage')
    return admin


def capture_and_upload(schema, admin):
    with tempfile.TemporaryDirectory(prefix='production-prelaunch-backup-',
                                     dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        source = private_json(private, 'source.json', {
            'host': schema.HOST, 'port': 25060, 'database': 'governance_prod',
            'user': 'doadmin', 'password': admin, 'sslmode': 'verify-full',
            'caFile': str(schema.CA),
        })
        config = private_json(private, 'capture.json', {
            'environment': 'prod', 'connectionFile': str(source),
            'binaries': '/usr/lib/postgresql/17/bin', 'journals': [],
            'outputRoot': str(ARCHIVES), 'keyFile': str(ROOT / 'backup.key'),
            'consistency': 'quiesced',
        })
        admin = ''
        stopped = False
        try:
            stopped = True
            run('systemctl', 'stop', API, timeout=45)
            if status(API) != {'UnitFileState=enabled', 'ActiveState=inactive'}:
                raise ValueError('Production API did not quiesce')
            if schema.psql('doadmin', schema.protected(schema.ADMIN, 1025),
                           'SELECT count(*) FROM governance_customer_projects;') != '0':
                raise ValueError('Production project appeared during quiescence')
            captured = json.loads(run(NODE,
                'scripts/governance-postgres-recovery.cjs', 'backup', str(config),
                timeout=300).stdout)
        finally:
            if stopped:
                run('systemctl', 'start', API, timeout=45)
                if status(API) != {'UnitFileState=enabled', 'ActiveState=active'}:
                    raise ValueError('Production API restart requires operator review')
                ready = False
                for _ in range(20):
                    probe = subprocess.run(('curl', '--silent', '--show-error',
                                            '--max-time', '2', '--output', '/dev/null',
                                            '--write-out', '%{http_code}',
                                            'http://127.0.0.1:8791/ready'),
                                           capture_output=True, text=True, timeout=5,
                                           check=False)
                    if probe.returncode == 0 and probe.stdout == '200':
                        ready = True
                        break
                    time.sleep(0.5)
                if not ready:
                    raise ValueError('Production API private readiness failed after restart')
        backup_id = captured.get('id')
        directory = pathlib.Path(captured.get('directory', ''))
        if captured.get('operation') != 'backup' or captured.get('environment') != 'prod' or \
                captured.get('journalRoles') != [] or \
                not isinstance(backup_id, str) or not re.fullmatch(r'[a-f0-9-]{36}', backup_id) or \
                directory.parent != ARCHIVES or not directory.is_dir():
            raise ValueError('Production backup identity mismatch')
        transfer = private_json(private, 'upload.json', {
            'environment': 'prod', 'directory': str(directory), 'bucket': BUCKET,
            'prefix': 'orvessian-production', 'endpoint': ENDPOINT, 'region': REGION,
            'credentialsFile': str(ROOT / 'b2-upload-credentials.json'),
            'keyFile': str(ROOT / 'backup.key'), 'latestFile': str(LATEST),
        })
        uploaded = json.loads(run(NODE,
            'scripts/governance-backup-object-storage.cjs', 'upload', str(transfer),
            timeout=600).stdout)
        if uploaded.get('operation') != 'upload' or uploaded.get('id') != backup_id or \
                uploaded.get('environment') != 'prod' or uploaded.get('bucket') != BUCKET or \
                uploaded.get('journalRoles') != [] or \
                uploaded.get('upload') != 'complete-marker-written':
            raise ValueError('Production B2 completion marker mismatch')
        print('production_prelaunch_backup=complete;backup_id=' + backup_id +
              ';journals=none;api=restarted;remote_restore=not_tested')


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise ValueError('Usage: run-production-prelaunch-backup.py [--apply]')
    schema = module()
    lock = os.open(ROOT / 'prelaunch-backup.lock',
                   os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Protected Production backup lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        admin = preflight(schema)
        if sys.argv[1:]:
            capture_and_upload(schema, admin)
        else:
            print('production_prelaunch_backup=ready;mode=read-only;projects=0')
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired, BlockingIOError):
        raise SystemExit('Production prelaunch backup failed; no secret printed; '
                         'inspect service and remote completion state') from None
