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

JOURNAL = Path('/var/lib/aichain-governance-pilot-worker/worker.sqlite')
UNITS = ('orvessian-pilot-portal.service',
         'aichain-governance-synthetic-api.service',
         'aichain-governance-pilot-evidence-worker.service')
TIMERS = ('orvessian-pilot-backup.timer',
          'orvessian-pilot-identity-replay.timer')


def systemctl(*args: str) -> str:
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=10, check=False)
    return result.stdout.strip() if result.returncode == 0 else ''


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


def worker_jobs() -> dict:
    db = sqlite3.connect('file:' + str(JOURNAL) + '?mode=ro', uri=True, timeout=3)
    try:
        environment = db.execute('SELECT name FROM governance_environment').fetchone()
        if environment != ('test',):
            raise ValueError('Worker journal environment mismatch')
        jobs = [json.loads(row[0]) for row in db.execute('SELECT body FROM jobs')]
    finally:
        db.close()
    now = time.time()
    unresolved = [job for job in jobs if job.get('state') != 'confirmed']
    ages = [round(now - job['at'] / 1000) for job in unresolved
            if isinstance(job.get('at'), (int, float))]
    return {'total': len(jobs), 'unresolved': len(unresolved),
            'oldestUnresolvedAgeSeconds': max(ages) if ages else None,
            'maxUnresolvedAttempts': max((job.get('attempts', 0) for job in unresolved), default=0)}


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    stat = os.statvfs('/')
    disk_free = round(100 * stat.f_bavail / stat.f_blocks, 1)
    memory_free = memory_available_percent()
    services = {unit: systemctl('is-active', unit) for unit in UNITS}
    timers = {unit: {'active': systemctl('is-active', unit),
                     'enabled': systemctl('is-enabled', unit)} for unit in TIMERS}
    endpoints = {'apiReady': loopback_status('http://127.0.0.1:8796/ready'),
                 'portalWorkspace': loopback_status('http://127.0.0.1:3002/workspace')}
    jobs = worker_jobs()
    journal_healthy = (jobs['unresolved'] == 0 or
                       jobs['oldestUnresolvedAgeSeconds'] is not None and
                       jobs['oldestUnresolvedAgeSeconds'] <= 1800 and
                       jobs['maxUnresolvedAttempts'] < 3)
    healthy = (disk_free >= 15 and memory_free >= 10 and
               all(value == 'active' for value in services.values()) and
               all(value == {'active': 'active', 'enabled': 'enabled'}
                   for value in timers.values()) and
               endpoints == {'apiReady': 200, 'portalWorkspace': 200} and
               journal_healthy)
    print(json.dumps({'healthy': healthy, 'diskFreePercent': disk_free,
                      'memoryAvailablePercent': memory_free, 'services': services,
                      'timers': timers, 'loopback': endpoints, 'workerJournal': jobs,
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
