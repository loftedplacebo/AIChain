#!/usr/bin/env python3
"""Submit one synthetic receipt through the public API after the local DB move."""

import base64
import json
import os
import pathlib
import re
import secrets
import stat
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

ENV = pathlib.Path('/etc/orvessian-chain-watch-internal.env')
OUTPUT = pathlib.Path('/var/lib/aichain-pilot-db-migration/cutover-smoke-event.json')
TENANT = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37'
PROJECT = 'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def main():
    info = ENV.lstat()
    if os.geteuid() != 0 or not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o007 or OUTPUT.exists():
        raise ValueError('Protected internal key and fresh acceptance event required')
    values = dict(line.split('=', 1) for line in ENV.read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    if values.get('ORVESSIAN_TENANT') != TENANT or values.get('ORVESSIAN_PROJECT') != PROJECT:
        raise ValueError('Internal project scope mismatch')
    token = base64.b64decode(values['ORVESSIAN_TOKEN_B64'], validate=True).decode('ascii')
    if not re.fullmatch(r'ovk_[0-9a-f]{64}', token):
        raise ValueError('Protected internal write key invalid')
    nonce = secrets.token_hex(16)
    event = {
        'schema': 'aichain.governance-event', 'schemaVersion': '0.1.0-draft',
        'profile': 'urn:aichain:profile:enterprise-agent',
        'tenantRef': TENANT, 'projectRef': PROJECT, 'environment': 'test',
        'eventId': 'contabo-cutover-smoke-' + nonce,
        'runRef': 'contabo-cutover-' + nonce, 'streamRef': 'contabo-cutover-' + nonce,
        'sequence': '1',
        'occurredAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'eventType': 'ai.run.completed',
        'source': {'kind': 'customer-sdk', 'integrationVersion': 'pilot-cutover-smoke-1',
                   'keyRef': 'protected-internal-write-key'},
        'agentRef': 'synthetic-cutover-smoke',
        'model': {'providerRef': 'synthetic', 'modelRef': 'cutover-example',
                  'deploymentRef': 'contabo-local-test', 'configVersion': '1'},
        'activity': {'taskClass': 'onboarding-test', 'latencyMs': 100},
        'result': {'status': 'completed'},
    }
    request = Request('https://api.orvessian.com/v1/events',
                      data=json.dumps(event, separators=(',', ':')).encode(),
                      headers={'Authorization': 'Bearer ' + token,
                               'Content-Type': 'application/json'}, method='POST')
    token = None
    try:
        with build_opener(NoRedirect()).open(request, timeout=20) as response:
            body = response.read(65537)
            if response.status != 201 or len(body) > 65536 or \
                    json.loads(body).get('status') not in ('accepted', 'created'):
                raise ValueError('Unexpected API submission result')
    except (HTTPError, URLError):
        raise ValueError('Public pilot API submission failed') from None
    fd = os.open(OUTPUT, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump({'tenant': TENANT, 'project': PROJECT, 'eventId': event['eventId']}, stream)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    print('cutover_smoke_submission=accepted;event_id=' + event['eventId'])


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, UnicodeError, json.JSONDecodeError):
        raise SystemExit('Contabo cutover synthetic submission failed; no key printed') from None
