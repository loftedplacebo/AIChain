#!/usr/bin/env python3
"""Report only the status of the protected internal project's installed write key."""
import base64
import hashlib
import os
import pathlib
import subprocess
import time
import json
import sys

ENV = pathlib.Path('/etc/orvessian-chain-watch-internal.env')
PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
TENANT = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37'
PROJECT = 'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'
DSN = ('host=orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com '
       'port=25060 dbname=governance_test user=doadmin sslmode=verify-full '
       'sslrootcert=/etc/aichain/governance/digitalocean-ca.crt')


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    if sys.argv[1:] not in ([], ['--json']):
        raise ValueError('Unexpected argument')
    values = dict(line.split('=', 1) for line in ENV.read_text().splitlines()
                  if '=' in line and not line.startswith('#'))
    if values.get('ORVESSIAN_TENANT') != TENANT or values.get('ORVESSIAN_PROJECT') != PROJECT:
        raise ValueError('Internal scope mismatch')
    digest = hashlib.sha256(base64.b64decode(values['ORVESSIAN_TOKEN_B64'])).hexdigest()
    query = ("SELECT expires_at,COALESCE(revoked_at,0) FROM governance_project_keys "
             "WHERE tenant='" + TENANT + "' AND project='" + PROJECT +
             "' AND token_hash='" + digest + "'")
    env = {**os.environ, 'PGPASSWORD': PASSWORD.read_text().strip()}
    result = subprocess.run(('psql', DSN, '-t', '-A', '-F', ',', '-c', query),
                            capture_output=True, text=True, env=env, timeout=20, check=True)
    rows = [line for line in result.stdout.splitlines() if line.strip()]
    if len(rows) != 1:
        if sys.argv[1:] == ['--json']:
            print(json.dumps({'active': False, 'expiresInHours': None}))
        else:
            print('internal_write_key_status=missing')
        return
    expiry, revoked = (int(item) for item in rows[0].split(','))
    now = int(time.time() * 1000)
    active = expiry > now and (revoked == 0 or revoked > now)
    hours = round((expiry - now) / 3600000, 1)
    if sys.argv[1:] == ['--json']:
        print(json.dumps({'active': active, 'expiresInHours': hours}))
    else:
        print('internal_write_key_status=' + ('active' if active else 'expired-or-revoked'))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print('internal_write_key_status=check-failed')
        raise SystemExit(1) from None
