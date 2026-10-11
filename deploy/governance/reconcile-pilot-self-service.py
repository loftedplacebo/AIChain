#!/usr/bin/env python3
"""Provision one newly created synthetic project through worker, funding and backup.

Runs as root from a timer. All customer-created project IDs come from the
privileged PostgreSQL catalog; no public request can choose a relayer or key.
"""
import fcntl
import hashlib
import json
import os
import pathlib
import re
import stat
import subprocess
import sys
from pilot_worker_registry import load_registry
from pilot_db_binding import load_admin

POLICY = pathlib.Path('/etc/aichain/pilot-self-service-policy.json')
REQUESTS = pathlib.Path('/etc/aichain/pilot-self-service-requests')
LOCK = pathlib.Path('/run/aichain-pilot-self-service.lock')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
CATALOG = '/opt/aichain/governance-pilot-api/scripts/check-pilot-project-inventory.cjs'
PROVISION = '/opt/aichain/governance-pilot-db-setup/provision-pilot-project-worker.py'
FUND = '/opt/aichain/governance-pilot-db-setup/fund-pilot-project-relayer.cjs'
SIGNERS = '/opt/aichain/governance-pilot-db-setup/sync-pilot-receipt-signers.py'
BACKUP_HEALTH = '/opt/aichain/governance-pilot-db-setup/check-pilot-backup-health.py'
TENANT = re.compile(r'^org-[a-z0-9-]{36}$')
PROJECT = re.compile(r'^prj-[a-z0-9-]{36}$')
POLICY_KEYS = {'batchSize', 'maxTransactionsPerHour', 'maxGasPriceWei',
               'dailyReservationWei', 'l1AllowanceWei'}


def protected_json(path, maximum=8192):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o077 or info.st_size < 1 or info.st_size > maximum:
        raise ValueError('Protected root-owned self-service input required')
    return json.loads(path.read_text(encoding='utf-8'))


def policy(require_enabled=True):
    value = protected_json(POLICY)
    binding = load_admin()
    expected_ca = '/etc/aichain/governance/digitalocean-ca.crt' if binding['profile'] == 'managed' else ''
    if set(value) != {'version', 'enabled', 'maxProjects', 'databaseUrlFile',
                      'databaseCaFile', 'workerPolicy', 'fundingTargetWei'} or \
            value['version'] != 1 or type(value['enabled']) is not bool or \
            (require_enabled and value['enabled'] is not True) or \
            type(value['maxProjects']) is not int or not 2 <= value['maxProjects'] <= 30 or \
            value['databaseUrlFile'] != '/etc/aichain/governance-workers/pilot-evidence-database-url' or \
            value['databaseCaFile'] != expected_ca or \
            not isinstance(value['workerPolicy'], dict) or \
            set(value['workerPolicy']) != POLICY_KEYS or \
            not re.fullmatch(r'[1-9][0-9]{0,17}', str(value['fundingTargetWei'])) or \
            int(value['fundingTargetWei']) > 1000000000000000:
        raise ValueError('Reviewed bounded self-service policy required')
    return value


def catalog():
    result = subprocess.run((NODE, CATALOG), capture_output=True, text=True,
                            timeout=30, check=False)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    if result.returncode not in (0, 1) or len(lines) != 1:
        raise ValueError('Project catalog check unavailable')
    data = json.loads(lines[0])
    if not isinstance(data, dict) or data.get('staleWorkers') or \
            type(data.get('projects')) is not int or \
            not isinstance(data.get('missingProjects'), list) or \
            data['projects'] != data.get('workers', 0) + len(data['missingProjects']):
        raise ValueError('Project catalog differs from worker inventory')
    for item in data['missingProjects']:
        if not isinstance(item, dict) or set(item) != {'tenant', 'project'} or \
                not TENANT.fullmatch(item['tenant']) or \
                not PROJECT.fullmatch(item['project']):
            raise ValueError('Invalid catalog project')
    return data


def request_for(item, settings):
    instance = hashlib.sha256((item['tenant'] + '\0' + item['project']).encode()).hexdigest()[:24]
    value = {'tenant': item['tenant'], 'project': item['project'],
             'databaseUrlFile': settings['databaseUrlFile'],
             'databaseCaFile': settings['databaseCaFile'],
             'rpcUrl': 'https://sepolia.base.org',
             'workerPolicy': settings['workerPolicy'],
             'fundingTargetWei': str(settings['fundingTargetWei']),
             'reviewId': 'auto-policy-v1-' + instance}
    REQUESTS.mkdir(mode=0o700, parents=True, exist_ok=True)
    info = REQUESTS.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Private request directory required')
    path = REQUESTS / (instance + '.json')
    if path.exists():
        if protected_json(path) != value:
            raise ValueError('Existing project request differs from reviewed policy')
    else:
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, sort_keys=True)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
    return path


def checked(command, timeout):
    result = subprocess.run(command, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode != 0:
        raise ValueError('Self-service step failed')
    return result.stdout


def ensure_backup():
    result = subprocess.run(('python3', BACKUP_HEALTH), capture_output=True,
                            text=True, timeout=30, check=False)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    if len(lines) != 1:
        raise ValueError('Backup role coverage unavailable')
    status = json.loads(lines[0])
    if status.get('marker_valid') is False:
        checked(('systemctl', 'start', 'orvessian-pilot-backup.service'), 1300)
        result = subprocess.run(('python3', BACKUP_HEALTH), capture_output=True,
                                text=True, timeout=30, check=False)
        lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
        if len(lines) != 1 or json.loads(lines[0]).get('marker_valid') is not True:
            raise ValueError('Backup does not cover all registered journals')
    elif status.get('marker_valid') is not True:
        raise ValueError('Backup status invalid')


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    check_only = sys.argv[1:] == ['--check-only']
    if sys.argv[1:] and not check_only:
        raise ValueError('Unexpected self-service argument')
    with os.fdopen(os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'r+') as lock:
        info = os.fstat(lock.fileno())
        if info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Protected reconciliation lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        settings = policy(require_enabled=not check_only)
        data = catalog()
        paused = [worker for worker in load_registry() if worker['state'] == 'paused']
        if check_only:
            print(json.dumps({'healthy': data['projects'] <= settings['maxProjects'],
                              'enabled': settings['enabled'],
                              'maxProjects': settings['maxProjects'],
                              'projects': data['projects'],
                              'pending': len(data['missingProjects']) + len(paused)}))
            return
        if data['projects'] > settings['maxProjects']:
            raise ValueError('Approved pilot project capacity exceeded')
        if not data['missingProjects'] and not paused:
            checked(('python3', SIGNERS, '--apply'), 60)
            ensure_backup()
            print(json.dumps({'healthy': True, 'projects': data['projects'],
                              'pending': 0}))
            return
        if paused:
            item = {'tenant': paused[0]['tenant'], 'project': paused[0]['project']}
            instance = hashlib.sha256((item['tenant'] + '\0' + item['project']).encode()).hexdigest()[:24]
            if not (REQUESTS / (instance + '.json')).is_file():
                raise ValueError('Paused operator worker has no auto-policy request')
        else:
            item = data['missingProjects'][0]
        request = request_for(item, settings)
        checked(('python3', PROVISION, str(request)), 120)
        checked(('python3', SIGNERS, '--apply'), 60)
        checked((NODE, FUND, str(request)), 90)
        checked(('python3', PROVISION, '--activate', str(request)), 120)
        ensure_backup()
        after = catalog()
        if any(row == item for row in after['missingProjects']):
            raise ValueError('Provisioned project absent from registry')
        print(json.dumps({'healthy': True, 'project': item['project'],
                          'provisioned': True, 'pending': len(after['missingProjects'])}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired, BlockingIOError):
        print('{"healthy":false,"reason":"pilot_self_service_reconciliation_failed"}',
              file=sys.stderr)
        raise SystemExit(1) from None
