#!/usr/bin/env python3
"""Read-only daily canary status for the hosted pilot alert check."""
import json
import os
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

CONFIG = Path('/etc/orvessian-internal-responses-canary.env')
STATE = Path('/var/lib/orvessian-internal-responses-canary/state.json')
TIMER = 'orvessian-internal-responses-canary.timer'
SERVICE = 'orvessian-internal-responses-canary.service'


def status(*args):
    result = subprocess.run(('systemctl', *args), capture_output=True,
                            text=True, timeout=10, check=False)
    return result.stdout.strip()


def check(now=None):
    if not CONFIG.is_file():
        return {'healthy': True, 'configured': False}
    now = now or datetime.now(ZoneInfo('Europe/London'))
    today = now.date()
    expected = today if now.hour >= 11 else today - timedelta(days=1)
    timer = {'active': status('is-active', TIMER), 'enabled': status('is-enabled', TIMER)}
    service = {'active': status('is-active', SERVICE),
               'result': status('show', SERVICE, '-p', 'Result', '--value')}
    state = None
    if STATE.is_file() and not STATE.is_symlink():
        info = STATE.stat()
        if info.st_mode & 0o077 == 0 and info.st_size <= 4096:
            raw = json.loads(STATE.read_text(encoding='utf-8'))
            if isinstance(raw, dict):
                state = {'date': raw.get('date'), 'phase': raw.get('phase'),
                         'eventId': raw.get('eventId')}
    healthy = (timer == {'active': 'active', 'enabled': 'enabled'} and
               service['result'] == 'success' and state is not None and
               state.get('phase') == 'verified' and
               isinstance(state.get('date'), str) and
               state['date'] >= expected.isoformat())
    return {'healthy': healthy, 'configured': True, 'expectedDate': expected.isoformat(),
            'timer': timer, 'service': service, 'lastRun': state}


if __name__ == '__main__':
    try:
        if os.geteuid() != 0:
            raise ValueError('Root required')
        result = check()
        print(json.dumps(result, sort_keys=True))
        if not result['healthy']:
            raise SystemExit(1)
    except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"canary_health_check_failed"}')
        raise SystemExit(1) from None
