#!/usr/bin/env python3
"""Read-only loopback checks before exposing the Production webhook route."""

import json
import subprocess
import urllib.error
import urllib.request


BASE = 'http://127.0.0.1:8791'


def status(path, *, post=False):
    request = urllib.request.Request(
        BASE + path,
        data=b'{}' if post else None,
        headers={'Content-Type': 'application/json'} if post else {},
        method='POST' if post else 'GET',
    )
    try:
        with urllib.request.urlopen(request, timeout=5) as response:
            return response.status
    except urllib.error.HTTPError as error:
        return error.code


def main():
    unit = subprocess.run(('systemctl', 'show',
                           'orvessian-production-api.service', '-p',
                           'ActiveState', '-p', 'UnitFileState'),
                          capture_output=True, text=True, timeout=10,
                          check=False)
    values = {'health': status('/health'), 'ready': status('/ready'),
              'anonymousSession': status('/v1/session'),
              'unsignedWebhook': status('/v1/auth/workos-webhook', post=True)}
    fields = set(unit.stdout.splitlines())
    active = unit.returncode == 0 and 'ActiveState=active' in fields and \
        bool(fields & {'UnitFileState=disabled', 'UnitFileState=enabled'})
    enabled = 'UnitFileState=enabled' in fields
    healthy = active and values == {'health': 200, 'ready': 200,
                                    'anonymousSession': 401,
                                    'unsignedWebhook': 401}
    print(json.dumps({'healthy': healthy, 'unitActive': active,
                      'unitEnabled': enabled,
                      'statuses': values}, sort_keys=True))
    if not healthy:
        raise SystemExit(1)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print('{"healthy":false,"reason":"private_probe_failed"}')
        raise SystemExit(1) from None
