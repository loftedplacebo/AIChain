#!/usr/bin/env python3
"""Read-only status of the closed, journal-free Production backup window."""

import json
import os
import pathlib
import stat
import subprocess
import time
from datetime import datetime, timedelta, timezone


POINTER = pathlib.Path('/var/lib/aichain-production-backup/latest-b2.json')
SERVICE = 'orvessian-production-prelaunch-backup.service'
TIMER = 'orvessian-production-prelaunch-backup.timer'


def latest_due(now):
    current = datetime.fromtimestamp(now, timezone.utc)
    scheduled = current.replace(hour=2, minute=0, second=0, microsecond=0)
    if current < scheduled + timedelta(hours=1):
        scheduled -= timedelta(days=1)
    return scheduled


def systemctl(*args):
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=15, check=False)
    return result.stdout.strip() if result.returncode == 0 else 'unavailable'


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
    healthy = (valid and covered and timer == 'active' and enabled == 'enabled' and
               last == 'success' and api == 'active' and portal == 'inactive')
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
