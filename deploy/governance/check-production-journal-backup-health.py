#!/usr/bin/env python3
"""Read-only daily coverage check for the worker-journal Production backup."""

import importlib.util
import json
import os
import pathlib
import re
import stat
import subprocess
import time
from datetime import datetime, timezone

from production_worker_registry import (
    load_registry, verify_catalog, verify_journal_binding,
)


HERE = pathlib.Path(__file__).resolve().parent
POINTER = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
SERVICE = 'orvessian-production-journal-backup.service'
TIMER = 'orvessian-production-journal-backup.timer'
OLD_TIMER = 'orvessian-production-prelaunch-backup.timer'


def import_script(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


base = import_script('production_prelaunch_backup_health',
                     HERE / 'check-production-prelaunch-backup-health.py')
journal = import_script('production_journal_backup',
                        HERE / 'run-production-journal-backup.py')


def marker(now):
    info = POINTER.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o077 or info.st_size > 4096:
        raise ValueError('Protected Production completion pointer required')
    value = json.loads(POINTER.read_text(encoding='utf-8'))
    prefix = value.get('keyPrefix') if isinstance(value, dict) else None
    valid = (isinstance(value, dict) and set(value) == {
        'version', 'environment', 'bucket', 'keyPrefix', 'journalRoles'} and
        value['version'] == 2 and value['environment'] == 'prod' and
        value['bucket'] == journal.common.BUCKET and
        isinstance(prefix, str) and re.fullmatch(
            r'orvessian-production/prod/[a-f0-9-]{36}-[a-f0-9-]{36}',
            prefix) is not None and
        isinstance(value['journalRoles'], list))
    due = base.latest_due(now)
    return value, valid, info.st_mtime, due, due.timestamp() <= info.st_mtime <= now


def coverage():
    schema = journal.common.module()
    admin = schema.protected(schema.ADMIN, 1025)
    database_is_prod = schema.psql('doadmin', admin,
                                   'SELECT name FROM governance_environment;') == 'prod'
    document, workers = load_registry()
    chain = document['chain']
    if not workers or chain is None:
        return database_is_prod, False, False, [], 0
    catalog = journal.catalog(schema, admin)
    try:
        verify_catalog(workers, catalog)
        covered = True
    except ValueError:
        covered = False
    worker_states = {}
    journals_valid = True
    for worker in workers:
        worker_states[worker['role']] = base.systemctl('is-active', worker['unit'])
        try:
            verify_journal_binding(worker, chain)
        except (OSError, ValueError):
            journals_valid = False
    active = all(state == 'active' for state in worker_states.values())
    return database_is_prod, covered, journals_valid and active, [
        worker['role'] for worker in workers], len(catalog)


def report(now):
    value, marker_valid, completed, due, recent = marker(now)
    database, catalog_covered, workers_healthy, roles, projects = coverage()
    scope_valid = marker_valid and value['journalRoles'] == roles and bool(roles)
    timer = base.systemctl('is-active', TIMER)
    enabled = base.systemctl('is-enabled', TIMER)
    old_timer = base.systemctl('is-active', OLD_TIMER)
    old_enabled = base.systemctl('is-enabled', OLD_TIMER)
    last = base.systemctl('show', '-p', 'Result', '--value', SERVICE)
    api = base.systemctl('is-active', journal.common.API)
    portal = base.systemctl('is-active', journal.common.PORTAL)
    healthy = all((scope_valid, recent, database, catalog_covered,
                   workers_healthy, timer == 'active', enabled == 'enabled',
                   old_timer != 'active', old_enabled == 'disabled',
                   last == 'success', api == 'active',
                   portal in ('active', 'inactive')))
    return {
        'healthy': healthy,
        'scope': 'Production database and every registered worker journal',
        'marker_valid': marker_valid,
        'marker_worker_scope_matches_registry': scope_valid,
        'last_completed_upload_utc': datetime.fromtimestamp(
            completed, timezone.utc).isoformat(),
        'latest_due_backup_utc': due.isoformat(),
        'latest_due_backup_covered': recent,
        'database_is_prod': database,
        'project_catalog_covered': catalog_covered,
        'project_count': projects,
        'registered_worker_count': len(roles),
        'registered_workers_healthy': workers_healthy,
        'timer': timer,
        'timer_enabled': enabled,
        'prelaunch_timer': old_timer,
        'prelaunch_timer_enabled': old_enabled,
        'last_service_result': last,
        'api': api,
        'portal': portal,
    }


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    result = report(time.time())
    print(json.dumps(result, sort_keys=True))
    if not result['healthy']:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"production_journal_backup_health_check_failed"}')
        raise SystemExit(1) from None
