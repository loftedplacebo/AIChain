#!/usr/bin/env python3
"""Fetch the exact Production webhook secret and install it without printing it."""

import json
import os
import pathlib
import re
import stat
import subprocess
import tempfile
import urllib.request


DESTINATION = pathlib.Path('/etc/aichain/production/workos.env')
ENDPOINT_ID = 'we_01M4VBTD55EZZQWYRHARZX79GN'
ENDPOINT_URL = 'https://api-prod.orvessian.com/v1/auth/workos-webhook'


def fetch_secret(api_key):
    request = urllib.request.Request(
        'https://api.workos.com/webhook_endpoints?limit=100',
        headers={'Authorization': 'Bearer ' + api_key, 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise ValueError('WorkOS endpoint query failed')
        payload = json.load(response)
    if not isinstance(payload, dict) or \
            not isinstance(payload.get('list_metadata'), dict) or \
            not isinstance(payload.get('data'), list):
        raise ValueError('Invalid WorkOS endpoint list')
    if payload['list_metadata'].get('after'):
        raise ValueError('WorkOS endpoint list is incomplete')
    matches = [item for item in payload['data']
               if isinstance(item, dict) and item.get('id') == ENDPOINT_ID]
    if len(matches) != 1:
        raise ValueError('Expected one Production webhook endpoint')
    endpoint = matches[0]
    if endpoint.get('endpoint_url') != ENDPOINT_URL or \
            endpoint.get('events') != ['session.revoked'] or \
            endpoint.get('status') != 'enabled':
        raise ValueError('Production webhook scope mismatch')
    secret = endpoint.get('secret')
    if not isinstance(secret, str) or not re.fullmatch(
            r'(?:whsec_[A-Za-z0-9_-]{20,500}|[A-Za-z0-9]{24,128})', secret):
        raise ValueError('WorkOS did not return a usable webhook secret')
    return secret


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    parent = DESTINATION.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or \
            (os.name == 'posix' and (parent.st_uid != 0 or parent.st_mode & 0o077)):
        raise ValueError('Protected WorkOS Production directory required')
    info = DESTINATION.lstat()
    if not stat.S_ISREG(info.st_mode) or \
            (os.name == 'posix' and (info.st_uid != 0 or info.st_mode & 0o077)) or \
            info.st_size > 2048:
        raise ValueError('Protected WorkOS Production file required')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          capture_output=True, text=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled')
    existing = DESTINATION.read_text(encoding='ascii')
    if not re.fullmatch(r'WORKOS_API_KEY=(sk_[A-Za-z0-9_-]{20,1020})\n', existing):
        raise ValueError('Exactly one Production API key required')
    api_key = existing.split('=', 1)[1].strip()
    secret = fetch_secret(api_key)
    fd, temporary = tempfile.mkstemp(prefix='.workos-webhook-',
                                      dir=DESTINATION.parent)
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(existing + 'WORKOS_WEBHOOK_SECRET=' + secret + '\n')
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, DESTINATION)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('production_workos_webhook=installed;endpoint=verified;secret=hidden;service=off')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        raise SystemExit('Production WorkOS webhook installation failed; no secret printed') from None
