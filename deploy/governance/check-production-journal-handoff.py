#!/usr/bin/env python3
"""Read-only readiness check before switching the Production backup timer."""

import argparse
import importlib.util
import json
import pathlib
import stat
import subprocess
from datetime import datetime, timezone


HERE = pathlib.Path(__file__).resolve().parent


def import_script(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


drill = import_script('production_journal_restore_drill',
                      HERE / 'verify-production-journal-b2-restore.py')
OLD_TIMER = 'orvessian-production-prelaunch-backup.timer'
NEW_TIMER = 'orvessian-production-journal-backup.timer'


def unit_state(verb, unit):
    result = subprocess.run(('systemctl', verb, unit), capture_output=True,
                            text=True, timeout=15, check=False)
    return result.stdout.strip()


def acceptance():
    path = drill.ACCEPTANCE
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 4096:
        raise ValueError('Protected journal restore acceptance required')
    value = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(value, dict) or set(value) != {
            'version', 'environment', 'backupId', 'keyPrefix',
            'journalRoles', 'chain', 'result', 'completedAt'}:
        raise ValueError('Exact journal restore acceptance required')
    completed = datetime.fromisoformat(value['completedAt'])
    if completed.tzinfo is None or completed > datetime.now(timezone.utc):
        raise ValueError('Valid journal restore completion time required')
    return value, info


def preflight(backup_id):
    prefix, workers, chain = drill.preflight(backup_id)
    value, accepted_info = acceptance()
    pointer_info = drill.base.LATEST.lstat()
    if value != {
            'version': 1,
            'environment': 'prod',
            'backupId': backup_id,
            'keyPrefix': prefix,
            'journalRoles': [worker['role'] for worker in workers],
            'chain': chain,
            'result': 'closed-restore-review-passed',
            'completedAt': value['completedAt'],
    } or accepted_info.st_mtime < pointer_info.st_mtime:
        raise ValueError('Latest journal B2 set has no matching closed restore')
    if (unit_state('is-active', OLD_TIMER) != 'active' or
            unit_state('is-enabled', OLD_TIMER) != 'enabled' or
            unit_state('is-active', NEW_TIMER) != 'inactive' or
            unit_state('is-enabled', NEW_TIMER) != 'disabled'):
        raise ValueError('Reviewed Production backup timer state required')
    return len(workers)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    args = parser.parse_args()
    workers = preflight(args.backup_id)
    print('production_journal_backup_handoff=ready;workers=' + str(workers) +
          ';mode=read-only')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production journal backup handoff is not ready; '
                         'no timer changed') from None
