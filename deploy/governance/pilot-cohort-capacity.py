#!/usr/bin/env python3
"""Read-only structural capacity check for the ten-partner synthetic pilot.

This is a planning check, not evidence of throughput or permission to raise the
live project cap. It runs only existing read-only checks and prints no secrets.
"""
import json
import os
import pathlib
import stat
import subprocess

from pilot_worker_registry import MAX_WORKERS

NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
ROOT = '/opt/aichain/governance-pilot-db-setup/'
CATALOG = '/opt/aichain/governance-pilot-api/scripts/check-pilot-project-inventory.cjs'
TARGET_PARTNERS = 10
RETAINED_INTERNAL_PROJECTS = 4
MAX_JOURNALS = 32
FUNDING_TARGET_WEI = 1_000_000_000_000_000
TRANSFER_GAS_MARGIN_WEI = 50_000_000_000_000
POLICY = pathlib.Path('/etc/aichain/pilot-self-service-policy.json')


def read_json(command):
    result = subprocess.run(command, capture_output=True, text=True,
                            timeout=45, check=False)
    lines = [line for line in result.stdout.splitlines() if line.startswith('{')]
    if len(lines) != 1:
        raise ValueError('Capacity prerequisite check unavailable')
    value = json.loads(lines[0])
    if not isinstance(value, dict):
        raise ValueError('Capacity prerequisite check invalid')
    # The catalog exits 1 when a newly-created project awaits its worker. That
    # state must be visible in the report rather than hiding the project count.
    if result.returncode not in (0, 1):
        raise ValueError('Capacity prerequisite check failed')
    return value


def funding_target():
    info = POLICY.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= 8192:
        raise ValueError('Protected self-service policy required')
    value = json.loads(POLICY.read_text(encoding='utf-8'))
    target = value.get('fundingTargetWei')
    if type(target) is not str or not target.isdigit() or \
            not 1 <= int(target) <= FUNDING_TARGET_WEI:
        raise ValueError('Invalid funding target')
    return int(target)


def assess(catalog, self_service, backup, target_wei=FUNDING_TARGET_WEI):
    required = TARGET_PARTNERS + RETAINED_INTERNAL_PROJECTS
    projects = catalog.get('projects')
    workers = catalog.get('workers')
    maximum = self_service.get('maxProjects')
    balance = self_service.get('fundingBalanceWei')
    if (type(projects) is not int or type(workers) is not int or
            type(maximum) is not int or type(balance) is not str or
            not balance.isdigit() or not isinstance(catalog.get('missingProjects'), list) or
            not isinstance(catalog.get('staleWorkers'), list)):
        raise ValueError('Invalid project capacity inputs')
    if projects < 0 or workers < 0 or maximum < 2 or maximum > MAX_WORKERS or \
            type(target_wei) is not int or not 1 <= target_wei <= FUNDING_TARGET_WEI:
        raise ValueError('Invalid project capacity range')
    remaining = max(0, required - projects)
    funding_needed = remaining * (target_wei + TRANSFER_GAS_MARGIN_WEI)
    blockers = []
    if projects != workers or catalog['missingProjects'] or catalog['staleWorkers']:
        blockers.append('project_worker_inventory')
    if (self_service.get('timerActive') is not True or
            self_service.get('timerEnabled') is not True or
            self_service.get('serviceFailed') is not False or
            self_service.get('pending') != 0):
        blockers.append('self_service_provisioning')
    if self_service.get('capacity', {}).get('used') != projects or \
            self_service.get('capacity', {}).get('maxProjects') != maximum or \
            self_service.get('capacity', {}).get('triggerEnabled') is not True:
        blockers.append('database_capacity_boundary')
    if maximum < required:
        blockers.append('project_cap')
    if required > MAX_WORKERS or required > MAX_JOURNALS:
        blockers.append('worker_or_backup_role_limit')
    if int(balance) < funding_needed:
        blockers.append('funding_for_remaining_slots')
    if backup.get('healthy') is not True or \
            backup.get('marker_valid') is not True or \
            backup.get('latest_due_backup_covered') is not True:
        blockers.append('backup_coverage')
    return {'structuralReady': not blockers,
            'throughputMeasured': False,
            'targetPartners': TARGET_PARTNERS,
            'retainedInternalProjects': RETAINED_INTERNAL_PROJECTS,
            'requiredTotalProjects': required,
            'currentProjects': projects,
            'currentWorkers': workers,
            'currentProjectCap': maximum,
            'additionalSlotsNeeded': remaining,
            'minimumFundingForRemainingSlotsWei': str(funding_needed),
            'fundingBalanceWei': balance,
            'blockers': blockers}


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    catalog = read_json((NODE, CATALOG))
    self_service = read_json(('python3', ROOT + 'check-pilot-self-service-health.py'))
    backup = read_json(('python3', ROOT + 'check-pilot-backup-health.py'))
    print(json.dumps(assess(catalog, self_service, backup, funding_target()),
                     sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired,
            json.JSONDecodeError):
        print('{"structuralReady":false,"reason":"capacity_check_unavailable"}')
        raise SystemExit(1) from None
