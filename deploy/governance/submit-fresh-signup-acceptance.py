#!/usr/bin/env python3
"""Submit one durable synthetic event for the fresh-account pilot project."""
import getpass
import json
import os
import pathlib
import re
import secrets
import sys
from datetime import datetime, timezone
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener

TENANT = 'org-2a00a025-c3e5-498f-9599-b7e290641baf'
PROJECT = 'prj-c5526c45-2b3b-4921-a58f-edf1a1b33cf3'
STATE = pathlib.Path('/var/lib/aichain-fresh-signup-acceptance/event.json')
API = 'https://api.orvessian.com/v1/events'


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def saved_event():
    STATE.parent.mkdir(mode=0o700, exist_ok=True)
    if STATE.exists():
        if STATE.is_symlink() or STATE.stat().st_mode & 0o077:
            raise ValueError('Protected acceptance state required')
        event = json.loads(STATE.read_text(encoding='utf-8'))
        if event.get('tenantRef') != TENANT or event.get('projectRef') != PROJECT:
            raise ValueError('Acceptance project mismatch')
        return event
    nonce = secrets.token_hex(16)
    event = {
        'schema': 'aichain.governance-event', 'schemaVersion': '0.1.0-draft',
        'profile': 'urn:aichain:profile:enterprise-agent',
        'tenantRef': TENANT, 'projectRef': PROJECT, 'environment': 'test',
        'eventId': 'fresh-signup-acceptance-' + nonce,
        'runRef': 'fresh-signup-acceptance-' + nonce,
        'streamRef': 'fresh-signup-acceptance-' + nonce,
        'sequence': '1',
        'occurredAt': datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z'),
        'eventType': 'ai.run.completed',
        'source': {'kind': 'customer-sdk', 'integrationVersion': 'pilot-fresh-signup-acceptance-1',
                   'keyRef': 'one-day-fresh-signup-key'},
        'agentRef': 'synthetic-fresh-signup-acceptance',
        'model': {'providerRef': 'synthetic', 'modelRef': 'acceptance-example',
                  'deploymentRef': 'fresh-signup-acceptance', 'configVersion': '1'},
        'activity': {'taskClass': 'onboarding-test', 'latencyMs': 100},
        'result': {'status': 'completed'},
    }
    fd = os.open(STATE, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        json.dump(event, stream, sort_keys=True)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    return event


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise ValueError('Run as root in an interactive SSH terminal')
    event = saved_event()
    key = getpass.getpass('One-day Fresh Signup Acceptance API key: ').strip()
    if not re.fullmatch(r'ovk_[0-9a-f]{64}', key):
        raise ValueError('Complete project ovk_ key required')
    request = Request(API, data=json.dumps(event, separators=(',', ':')).encode(),
                      headers={'Authorization': 'Bearer ' + key,
                               'Content-Type': 'application/json'}, method='POST')
    key = None
    try:
        with build_opener(NoRedirect()).open(request, timeout=15) as response:
            if response.status not in (200, 201):
                raise ValueError('Unexpected acceptance response')
            body = response.read(65537)
            if len(body) > 65536:
                raise ValueError('Acceptance response too large')
            status = json.loads(body).get('status')
            if status not in ('accepted', 'created', 'duplicate'):
                raise ValueError('Acceptance response rejected')
            print('fresh_signup_submission=' + status)
            print('event_id=' + event['eventId'])
    except HTTPError as error:
        print('fresh_signup_submission=http-' + str(error.code))
        raise SystemExit(1) from None
    except URLError:
        raise ValueError('Network or TLS error') from None


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError):
        print('Fresh signup acceptance submission failed; no key printed.')
        raise SystemExit(1) from None
