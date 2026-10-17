#!/usr/bin/env python3
"""Read-only status of the closed, journal-free Production backup window."""

import json
import hashlib
import importlib.util
import os
import pathlib
import re
import stat
import subprocess
import time
from datetime import datetime, timedelta, timezone
from production_worker_registry import load_registry


POINTER = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
SCHEMA = pathlib.Path('/opt/aichain/governance-pilot-db-setup/apply-production-schema.py')
SERVICE = 'orvessian-production-prelaunch-backup.service'
TIMER = 'orvessian-production-prelaunch-backup.timer'
SITE = pathlib.Path('/etc/nginx/sites-available/orvessian-production-preparation')
ENABLED = pathlib.Path('/etc/nginx/sites-enabled/orvessian-production-preparation')
WEBHOOK_ONLY_SHA256 = 'be2f4fc7b79516a2bbb658260d19067035d934a1d6fce4abb904affd2d86c933'
OWNER_PREVIEW_SHA256 = '8ecaa31f22691e23d83723c5b77254ac0e36c8c11410d6bad90444d2528ede4d'
WORKERS = ('orvessian-production-worker.service',
           'orvessian-production-evidence-worker.service')


def latest_due(now):
    current = datetime.fromtimestamp(now, timezone.utc)
    scheduled = current.replace(hour=2, minute=0, second=0, microsecond=0)
    if current < scheduled + timedelta(hours=1):
        scheduled -= timedelta(days=1)
    return scheduled


def systemctl(*args):
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=15, check=False)
    value = result.stdout.strip()
    return value if value else 'unavailable'


def http_status(host, path, *, post=False):
    args = ['curl', '--silent', '--show-error', '--max-time', '5',
            '--output', '/dev/null', '--write-out', '%{http_code}',
            '--resolve', host + ':443:127.0.0.1']
    if post:
        args.extend(('--header', 'Content-Type: application/json', '--data', '{}'))
    result = subprocess.run((*args, 'https://' + host + path),
                            capture_output=True, text=True, timeout=8,
                            check=False)
    if result.returncode or not re.fullmatch(r'[1-5][0-9]{2}', result.stdout):
        return 0
    return int(result.stdout)


def portal_profile(portal):
    if systemctl('is-enabled', 'orvessian-production-portal.service') != 'disabled' or \
            not ENABLED.is_symlink() or os.readlink(ENABLED) != str(SITE):
        return 'unexpected'
    info = SITE.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022:
        return 'unexpected'
    digest = hashlib.sha256(SITE.read_bytes()).hexdigest()
    if portal == 'inactive' and digest == WEBHOOK_ONLY_SHA256:
        return 'webhook-only'
    if portal == 'active' and digest == OWNER_PREVIEW_SHA256:
        observed = (http_status('prod.orvessian.com', '/workspace'),
                    http_status('api-prod.orvessian.com', '/v1/auth/status'),
                    http_status('api-prod.orvessian.com', '/v1/workspaces'),
                    http_status('api-prod.orvessian.com', '/v1/keys'),
                    http_status('api-prod.orvessian.com', '/health'),
                    http_status('api-prod.orvessian.com',
                                '/v1/auth/workos-webhook', post=True))
        if observed == (200, 200, 404, 404, 404, 401):
            return 'owner-preview'
    return 'unexpected'


def closed_scope():
    spec = importlib.util.spec_from_file_location('production_schema', SCHEMA)
    schema = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(schema)
    admin = schema.protected(schema.ADMIN, 1025)
    marker = schema.psql('doadmin', admin,
                         'SELECT name FROM governance_environment;')
    count = schema.psql('doadmin', admin,
                        'SELECT count(*) FROM governance_customer_projects;')
    states = {unit: systemctl('show', '-p', 'UnitFileState',
                              '-p', 'ActiveState', unit) for unit in WORKERS}
    _, registered = load_registry()
    worker_absent = all(set(state.splitlines()) == {
        'UnitFileState=', 'ActiveState=inactive'} for state in states.values()) and \
        not registered
    return marker == 'prod', count == '0', worker_absent


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    now = time.time()
    due = latest_due(now)
    info = POINTER.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o077 or info.st_size > 4096:
        raise ValueError('Protected Production completion pointer required')
    marker = json.loads(POINTER.read_text(encoding='utf-8'))
    valid = (set(marker) == {'version', 'environment', 'bucket', 'keyPrefix',
                             'journalRoles'} and marker['version'] == 2 and
             marker['environment'] == 'prod' and
             marker['bucket'] == 'orvessian-prod-backups-2026' and
             isinstance(marker['keyPrefix'], str) and
             marker['keyPrefix'].startswith('orvessian-production/prod/') and
             marker['journalRoles'] == [])
    completed = info.st_mtime
    covered = due.timestamp() <= completed <= now
    timer = systemctl('is-active', TIMER)
    enabled = systemctl('is-enabled', TIMER)
    last = systemctl('show', '-p', 'Result', '--value', SERVICE)
    api = systemctl('is-active', 'orvessian-production-api.service')
    portal = systemctl('is-active', 'orvessian-production-portal.service')
    portal_mode = portal_profile(portal)
    database_is_prod, projects_absent, workers_absent = closed_scope()
    healthy = (valid and covered and timer == 'active' and enabled == 'enabled' and
               last == 'success' and api == 'active' and
               portal_mode in ('webhook-only', 'owner-preview') and
               database_is_prod and projects_absent and workers_absent)
    print(json.dumps({
        'healthy': healthy,
        'scope': 'closed Production database with zero projects and no worker journals',
        'marker_valid': valid,
        'last_completed_upload_utc': datetime.fromtimestamp(
            completed, timezone.utc).isoformat(),
        'latest_due_backup_utc': due.isoformat(),
        'latest_due_backup_covered': covered,
        'timer': timer,
        'timer_enabled': enabled,
        'last_service_result': last,
        'api': api,
        'portal': portal,
        'portal_mode': portal_mode,
        'database_is_prod': database_is_prod,
        'projects_absent': projects_absent,
        'workers_absent': workers_absent,
    }, sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"production_backup_health_check_failed"}')
        raise SystemExit(1) from None
