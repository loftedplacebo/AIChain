#!/usr/bin/env python3
"""Read-only health check for the scheduled hosted-pilot B2 backup."""

import json
import os
import pathlib
import subprocess
import time
from datetime import datetime, timedelta, timezone
from pilot_worker_registry import load_registry


POINTER = pathlib.Path('/etc/aichain/pilot-backup/latest-upload.json')
BACKUP_HOUR_UTC = 3
COMPLETION_GRACE_HOURS = 1


def latest_due_backup(now: float) -> datetime:
    current = datetime.fromtimestamp(now, timezone.utc)
    scheduled = current.replace(hour=BACKUP_HOUR_UTC, minute=0,
                                second=0, microsecond=0)
    if current < scheduled + timedelta(hours=COMPLETION_GRACE_HOURS):
        scheduled -= timedelta(days=1)
    return scheduled


def covers_latest_due_backup(completed_at: float, now: float) -> bool:
    return latest_due_backup(now).timestamp() <= completed_at <= now


def systemctl(*args: str) -> str:
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=15, check=False)
    return result.stdout.strip()


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    marker = json.loads(POINTER.read_text(encoding='utf-8'))
    workers = load_registry()
    required_roles = {worker['role'] for worker in workers}
    valid_marker = (marker.get('version') == 2 and
                    marker.get('environment') == 'test' and
                    marker.get('bucket') == 'orvessian-pilot-test-backups' and
                    isinstance(marker.get('keyPrefix'), str) and
                    marker['keyPrefix'].startswith('orvessian-pilot/test/') and
                    isinstance(marker.get('journalRoles'), list) and
                    all(isinstance(role, str) for role in marker['journalRoles']) and
                    set(marker['journalRoles']) == required_roles and
                    len(marker['journalRoles']) == len(required_roles))
    completed_at = POINTER.stat().st_mtime
    now = time.time()
    age_hours = round((now - completed_at) / 3600, 2)
    due_backup = latest_due_backup(now)
    window_covered = covers_latest_due_backup(completed_at, now)
    timer = systemctl('is-active', 'orvessian-pilot-backup.timer')
    enabled = systemctl('is-enabled', 'orvessian-pilot-backup.timer')
    result = systemctl('show', '-p', 'Result', '--value',
                       'orvessian-pilot-backup.service')
    portal = systemctl('is-active', 'orvessian-pilot-portal.service')
    api = systemctl('is-active', 'aichain-governance-synthetic-api.service')
    worker_states = {worker['role']: systemctl('is-active', worker['unit'])
                     for worker in workers}
    workers_healthy = all(worker_states[worker['role']] ==
                          ('active' if worker['state'] == 'active' else 'inactive')
                          for worker in workers)
    healthy = (valid_marker and window_covered and
               timer == 'active' and enabled == 'enabled' and
               result == 'success' and portal == 'active' and api == 'active' and
               workers_healthy)
    print(json.dumps({
        'healthy': healthy,
        'marker_valid': valid_marker,
        'last_completed_upload_utc': datetime.fromtimestamp(
            completed_at, timezone.utc).isoformat(),
        'last_completed_upload_age_hours': age_hours,
        'latest_due_backup_utc': due_backup.isoformat(),
        'latest_due_backup_covered': window_covered,
        'timer': timer or 'unavailable',
        'timer_enabled': enabled or 'unavailable',
        'last_service_result': result or 'unavailable',
        'portal': portal or 'unavailable',
        'api': api or 'unavailable',
        'workers': worker_states,
    }, sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"health_check_failed"}')
        raise SystemExit(1) from None
