#!/usr/bin/env python3
"""Read-only gate before retiring the old managed synthetic databases."""

import json
import pathlib
import subprocess
from datetime import datetime, timezone


ROOT = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
CHECKPOINT = datetime(2026, 10, 12, 3, 0, tzinfo=timezone.utc)
EXPECTED_DATABASES = {
    'governance_test',
    'gov_restore_b2_675760d159ba',
    'gov_restore_b2_c1e41b11b58a',
    'gov_restore_b2_c308eaf13583',
    'gov_restore_b2_c8073805c276',
    'gov_restore_b2_e60fcb48a34d',
}
EXPECTED_ROLES = {
    'governance_api', 'governance_evidence_worker', 'governance_migrations'
}


def read_check(name: str) -> dict:
    result = subprocess.run(('python3', str(ROOT / name)), capture_output=True,
                            text=True, timeout=60, check=False)
    if result.returncode:
        raise ValueError(name + ' failed')
    value = json.loads(result.stdout)
    if not isinstance(value, dict):
        raise ValueError(name + ' returned invalid JSON')
    return value


def assess(backup: dict, hosted: dict, inventory: dict) -> dict:
    blockers = []
    try:
        completed = datetime.fromisoformat(backup['last_completed_upload_utc'])
        if completed.tzinfo is None or completed.astimezone(timezone.utc) < CHECKPOINT:
            blockers.append('scheduled_local_backup_checkpoint')
    except (KeyError, TypeError, ValueError):
        blockers.append('backup_completion_timestamp')
    if not all(backup.get(key) is True for key in
               ('healthy', 'marker_valid', 'latest_due_backup_covered')):
        blockers.append('local_backup_health')
    if hosted.get('healthy') is not True:
        blockers.append('local_pilot_health')
    databases = inventory.get('databases')
    roles = inventory.get('roles')
    if not isinstance(databases, list) or not isinstance(roles, list):
        blockers.append('managed_inventory_shape')
    else:
        if {item.get('name') for item in databases} != EXPECTED_DATABASES:
            blockers.append('managed_database_inventory_changed')
        if {item.get('name') for item in roles} != EXPECTED_ROLES:
            blockers.append('managed_role_inventory_changed')
        if any(item.get('connections') != 0 for item in databases):
            blockers.append('managed_database_has_connections')
    return {
        'ready': not blockers,
        'blockers': blockers,
        'checkpoint_utc': CHECKPOINT.isoformat(),
        'last_completed_upload_utc': backup.get('last_completed_upload_utc'),
        'managed_databases': sorted(item.get('name') for item in databases)
            if isinstance(databases, list) else None,
        'managed_roles': sorted(item.get('name') for item in roles)
            if isinstance(roles, list) else None,
    }


def main() -> None:
    try:
        backup = read_check('check-pilot-backup-health.py')
        hosted = read_check('check-pilot-hosted-health.py')
        inventory = read_check('inspect-managed-cluster-for-production.py')
        result = assess(backup, hosted, inventory)
    except (OSError, ValueError, subprocess.TimeoutExpired, json.JSONDecodeError):
        result = {'ready': False, 'blockers': ['read_only_check_failed']}
    print(json.dumps(result, sort_keys=True))
    if not result['ready']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
