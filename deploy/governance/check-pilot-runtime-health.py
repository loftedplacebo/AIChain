#!/usr/bin/env python3
"""Read-only pilot VPS, loopback and hosted worker-journal health check."""

import json
import os
import sqlite3
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import ProxyHandler, build_opener
from pilot_worker_registry import load_registry, verify_journal_binding

UNITS = ('orvessian-pilot-portal.service',
         'aichain-governance-synthetic-api.service')
TIMERS = ('orvessian-pilot-backup.timer',
          'orvessian-pilot-identity-replay.timer')


def systemctl(*args: str) -> str:
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=10, check=False)
    return result.stdout.strip()


def unexpected_project_units(registered: set[str]) -> list[str]:
    output = systemctl('list-units', '--all', '--type=service', '--plain',
                       '--no-legend', 'aichain-governance-project-worker@*.service')
    units = {line.split()[0] for line in output.splitlines() if line.split()}
    return sorted(unit for unit in units if unit not in registered)


def loopback_status(url: str) -> int:
    try:
        with build_opener(ProxyHandler({})).open(url, timeout=3) as response:
            response.read(1024)
            return response.status
    except (OSError, URLError):
        return 0


def memory_available_percent() -> float:
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        if line.startswith(('MemTotal:', 'MemAvailable:')):
            name, number, _ = line.split()
            values[name[:-1]] = int(number)
    return round(100 * values['MemAvailable'] / values['MemTotal'], 1)


def worker_jobs(journal: Path) -> dict:
    db = sqlite3.connect('file:' + str(journal) + '?mode=ro', uri=True, timeout=3)
    try:
        environment = db.execute('SELECT name FROM governance_environment').fetchone()
        if environment != ('test',):
            raise ValueError('Worker journal environment mismatch')
        total = db.execute('SELECT count(*) FROM jobs').fetchone()[0]
        rows = db.execute("SELECT body FROM jobs WHERE COALESCE(json_extract(body, '$.state'), '') != 'confirmed' LIMIT 1001").fetchall()
        if len(rows) > 1000:
            raise ValueError('Worker unresolved journal scan exceeds limit')
        unresolved = [json.loads(body) for (body,) in rows]
    finally:
        db.close()
    now = time.time()
    ages = [round(now - job['at'] / 1000) for job in unresolved
            if isinstance(job.get('at'), (int, float))]
    return {'total': total, 'unresolved': len(unresolved),
            'oldestUnresolvedAgeSeconds': max(ages) if ages else None,
            'maxUnresolvedAttempts': max((job.get('attempts', 0) if isinstance(job.get('attempts', 0), int) else 3
                                          for job in unresolved), default=0)}


def worker_journal_healthy(jobs: dict) -> bool:
    return jobs['unresolved'] == 0 or (
        jobs['oldestUnresolvedAgeSeconds'] is not None and
        jobs['oldestUnresolvedAgeSeconds'] <= 1800 and
        jobs['maxUnresolvedAttempts'] < 3)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    stat = os.statvfs('/')
    disk_free = round(100 * stat.f_bavail / stat.f_blocks, 1)
    memory_free = memory_available_percent()
    workers = load_registry()
    for worker in workers:
        verify_journal_binding(worker)
    services = {unit: systemctl('is-active', unit) for unit in UNITS}
    worker_services = {worker['role']: systemctl('is-active', worker['unit'])
                       for worker in workers}
    orphan_units = unexpected_project_units({worker['unit'] for worker in workers})
    timers = {unit: {'active': systemctl('is-active', unit),
                     'enabled': systemctl('is-enabled', unit)} for unit in TIMERS}
    endpoints = {'apiReady': loopback_status('http://127.0.0.1:8796/ready'),
                 'portalWorkspace': loopback_status('http://127.0.0.1:3002/workspace')}
    jobs = {worker['role']: worker_jobs(Path(worker['journal']))
            for worker in workers}
    journal_healthy = all(worker_journal_healthy(item) for item in jobs.values())
    worker_services_healthy = all(worker_services[worker['role']] ==
                                  ('active' if worker['state'] == 'active' else 'inactive')
                                  for worker in workers)
    healthy = (disk_free >= 15 and memory_free >= 10 and
               all(value == 'active' for value in services.values()) and
               worker_services_healthy and not orphan_units and
               all(value == {'active': 'active', 'enabled': 'enabled'}
                   for value in timers.values()) and
               endpoints == {'apiReady': 200, 'portalWorkspace': 200} and
               journal_healthy)
    print(json.dumps({'healthy': healthy, 'diskFreePercent': disk_free,
                      'memoryAvailablePercent': memory_free, 'services': services,
                      'timers': timers, 'loopback': endpoints,
                      'workerServices': worker_services, 'orphanWorkerUnits': orphan_units,
                      'workerJournals': jobs,
                      'workerJournalHealthy': journal_healthy}, sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, IndexError, sqlite3.Error,
            subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"runtime_check_failed"}')
        raise SystemExit(1) from None
