#!/usr/bin/env python3
"""Quiesce every registered Production writer and capture DB plus worker journals.

This is an operator runner, not the active prelaunch timer. It cannot run until
the Production chain, workers, project catalog and pinned recovery code match.
"""

import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
import tempfile

from production_worker_registry import (
    LOCK as WORKER_LOCK, load_registry, verify_catalog,
    verify_journal_binding,
)

CORE_DIGESTS = {
    'services/governance/postgres-backup.cjs':
        '7a52e242cedb0084fda90ce5f2226cf3d165a1e3606c18bc883f1c7a20086d51',
    'services/governance/recovery.cjs':
        'f999170605b070c2567d5920b3309901163b14f3715dd0bfd4ed2b54ab49514f',
}

_COMMON = pathlib.Path(__file__).with_name('run-production-prelaunch-backup.py')
_SPEC = importlib.util.spec_from_file_location('production_prelaunch_backup',
                                                _COMMON)
common = importlib.util.module_from_spec(_SPEC)
_SPEC.loader.exec_module(common)


def pinned_core():
    for name, digest in CORE_DIGESTS.items():
        target = common.RUNNER / name
        if not target.is_file() or target.is_symlink() or \
                hashlib.sha256(target.read_bytes()).hexdigest() != digest:
            raise ValueError('Pinned journal-aware Production backup core required')


def catalog(schema, admin):
    sql = "SELECT COALESCE(json_agg(json_build_object('tenant',workspace,'project',id))::text,'[]') FROM governance_customer_projects;"
    value = json.loads(schema.psql('doadmin', admin, sql))
    if not isinstance(value, list):
        raise ValueError('Complete Production project catalog required')
    return value


def preflight(schema):
    if os.geteuid() != 0 or common.status(common.API) != {
            'UnitFileState=enabled', 'ActiveState=active'}:
        raise ValueError('Active isolated Production API required')
    portal = common.status(common.PORTAL)
    if portal not in ({'UnitFileState=disabled', 'ActiveState=inactive'},
                      {'UnitFileState=enabled', 'ActiveState=active'}):
        raise ValueError('Reviewed Production portal state required')
    pinned_core()
    key = schema.protected(common.ROOT / 'backup.key', 65)
    if not re.fullmatch(r'[a-f0-9]{64}', key):
        raise ValueError('Protected Production archive key required')
    credential = json.loads(schema.protected(
        common.ROOT / 'b2-upload-credentials.json', 4096))
    if set(credential) != {'accessKeyId', 'secretAccessKey'}:
        raise ValueError('Protected Production B2 upload credential required')
    credential = None
    admin = schema.protected(schema.ADMIN, 1025)
    if schema.psql('doadmin', admin,
                   'SELECT name FROM governance_environment;') != 'prod':
        raise ValueError('Production database marker mismatch')
    document, workers = load_registry()
    chain = document['chain']
    if not workers or chain is None:
        raise ValueError('Registered Base mainnet workers required')
    verify_catalog(workers, catalog(schema, admin))
    for worker in workers:
        if common.status(worker['unit']) != {
                'UnitFileState=enabled', 'ActiveState=active'}:
            raise ValueError('Registered Production worker is unavailable')
        verify_journal_binding(worker, chain)
    return admin, workers, chain, portal == {
        'UnitFileState=enabled', 'ActiveState=active'}


def capture_and_upload(schema, admin, workers, chain, portal_active):
    units = [worker['unit'] for worker in workers]
    roles = [worker['role'] for worker in workers]
    stopped = []
    with tempfile.TemporaryDirectory(prefix='production-journal-backup-',
                                     dir='/run') as temporary:
        private = pathlib.Path(temporary)
        os.chmod(private, 0o700)
        source = common.private_json(private, 'source.json', {
            'host': schema.HOST, 'port': 25060, 'database': 'governance_prod',
            'user': 'doadmin', 'password': admin, 'sslmode': 'verify-full',
            'caFile': str(schema.CA),
        })
        config = common.private_json(private, 'capture.json', {
            'environment': 'prod', 'connectionFile': str(source),
            'binaries': '/usr/lib/postgresql/17/bin',
            'journals': [{'role': worker['role'], 'path': worker['journal']}
                         for worker in workers],
            'outputRoot': str(common.ARCHIVES),
            'keyFile': str(common.ROOT / 'backup.key'),
            'consistency': 'quiesced',
        })
        admin = ''
        try:
            if portal_active:
                stopped.append(common.PORTAL)
                common.run('systemctl', 'stop', common.PORTAL, timeout=45)
            for unit in units:
                stopped.append(unit)
                common.run('systemctl', 'stop', unit, timeout=45)
            stopped.append(common.API)
            common.run('systemctl', 'stop', common.API, timeout=45)
            if any('ActiveState=inactive' not in common.status(unit)
                   for unit in stopped):
                raise ValueError('Production writers did not quiesce')
            verified_admin = schema.protected(schema.ADMIN, 1025)
            verify_catalog(workers, catalog(schema, verified_admin))
            for worker in workers:
                verify_journal_binding(worker, chain)
            captured = json.loads(common.run(
                common.NODE, 'scripts/governance-postgres-recovery.cjs',
                'backup', str(config), timeout=300).stdout)
            backup_id = captured.get('id')
            directory = pathlib.Path(captured.get('directory', ''))
            if captured.get('operation') != 'backup' or \
                    captured.get('environment') != 'prod' or \
                    captured.get('journalRoles') != roles or \
                    not isinstance(backup_id, str) or \
                    not re.fullmatch(r'[a-f0-9-]{36}', backup_id) or \
                    directory.parent != common.ARCHIVES or not directory.is_dir():
                raise ValueError('Production coordinated backup scope mismatch')
            inspect = common.private_json(private, 'inspect.json', {
                'environment': 'prod', 'directory': str(directory),
                'keyFile': str(common.ROOT / 'backup.key'), 'maxAgeHours': 1,
            })
            reviewed = json.loads(common.run(
                common.NODE, 'scripts/governance-postgres-recovery.cjs',
                'inspect', str(inspect), timeout=300).stdout)
            if reviewed.get('operation') != 'inspect' or \
                    reviewed.get('integrity') != 'verified' or \
                    reviewed.get('freshness') != 'fresh' or \
                    reviewed.get('id') != backup_id or \
                    reviewed.get('journalRoles') != roles:
                raise ValueError('Production archive authentication mismatch')
            transfer = common.private_json(private, 'upload.json', {
                'environment': 'prod', 'directory': str(directory),
                'bucket': common.BUCKET, 'prefix': 'orvessian-production',
                'endpoint': common.ENDPOINT, 'region': common.REGION,
                'credentialsFile': str(common.ROOT /
                                       'b2-upload-credentials.json'),
                'keyFile': str(common.ROOT / 'backup.key'),
                'latestFile': str(common.LATEST),
            })
            uploaded = json.loads(common.run(
                common.NODE, 'scripts/governance-backup-object-storage.cjs',
                'upload', str(transfer), timeout=600).stdout)
            if uploaded.get('operation') != 'upload' or \
                    uploaded.get('id') != backup_id or \
                    uploaded.get('environment') != 'prod' or \
                    uploaded.get('bucket') != common.BUCKET or \
                    uploaded.get('journalRoles') != roles or \
                    uploaded.get('upload') != 'complete-marker-written':
                raise ValueError('Production B2 journal backup marker mismatch')
        finally:
            restart_failed = False
            for unit in [common.API, *units, *([common.PORTAL] if portal_active
                                              else [])]:
                if unit in stopped:
                    try:
                        common.run('systemctl', 'start', unit, timeout=45)
                        if 'ActiveState=active' not in common.status(unit):
                            restart_failed = True
                    except (ValueError, subprocess.TimeoutExpired):
                        restart_failed = True
            if restart_failed:
                raise ValueError('Production writer restart failed')
        print('production_journal_backup=complete;backup_id=' + backup_id +
              ';workers=' + str(len(workers)) + ';restore=not_tested')


def main():
    if sys.argv[1:] not in ([], ['--apply']):
        raise ValueError('Usage: run-production-journal-backup.py [--apply]')
    lock = os.open(common.ROOT / 'prelaunch-backup.lock',
                   os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    worker_lock = None
    try:
        for descriptor in (lock,):
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                    stat.S_IMODE(info.st_mode) != 0o600:
                raise ValueError('Protected Production backup lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        worker_lock = os.open(WORKER_LOCK, os.O_RDWR | os.O_NOFOLLOW)
        info = os.fstat(worker_lock)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Protected Production worker registry lock required')
        fcntl.flock(worker_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        schema = common.module()
        admin, workers, chain, portal_active = preflight(schema)
        if sys.argv[1:]:
            capture_and_upload(schema, admin, workers, chain, portal_active)
        else:
            print('production_journal_backup=ready;mode=read-only;workers=' +
                  str(len(workers)))
    finally:
        if worker_lock is not None:
            os.close(worker_lock)
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired, BlockingIOError):
        raise SystemExit('Production journal backup failed; no secret printed; '
                         'inspect service and remote completion state') from None
