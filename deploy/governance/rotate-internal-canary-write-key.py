#!/usr/bin/env python3
"""Rotate the internal synthetic canary's write key at a hidden VPS prompt.

The new key is checked against the privileged project catalog before either
protected EnvironmentFile is replaced. No token is printed or put in argv.
"""
import base64
import getpass
import hashlib
import json
import os
import pathlib
import pwd
import re
import stat
import subprocess
import tempfile
import time
from pilot_db_binding import load_admin, psql_dsn, psql_environment

WATCHER = pathlib.Path('/etc/orvessian-chain-watch-internal.env')
CANARY = pathlib.Path('/etc/orvessian-internal-responses-canary.env')
CHECK = '/opt/aichain/governance-pilot-db-setup/check-internal-agent-write-key.py'
TENANT = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37'
PROJECT = 'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'


def protected(path, mode, group=None):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != mode or not 1 <= info.st_size <= 8192 or \
            group is not None and info.st_gid != group:
        raise ValueError('Protected file boundary required')
    return path.read_text(encoding='ascii').splitlines(keepends=True)


def setting(lines, name):
    values = [line.partition('=')[2].strip() for line in lines
              if line.startswith(name + '=')]
    if len(values) != 1:
        raise ValueError('One protected token setting required')
    return values[0]


def replace_token(lines, encoded):
    if setting(lines, 'ORVESSIAN_TENANT') != TENANT or \
            setting(lines, 'ORVESSIAN_PROJECT') != PROJECT:
        raise ValueError('Internal project scope mismatch')
    old = setting(lines, 'ORVESSIAN_TOKEN_B64')
    return ''.join(line.replace(old, encoded, 1)
                   if line.startswith('ORVESSIAN_TOKEN_B64=') else line
                   for line in lines)


def atomic_write(path, content, group):
    fd, temporary = tempfile.mkstemp(prefix='.orvessian-key-rotation-', dir=path.parent)
    try:
        os.fchmod(fd, 0o640)
        os.fchown(fd, 0, group)
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def verified_key(token):
    digest = hashlib.sha256(token.encode('ascii')).hexdigest()
    binding = load_admin()
    query = ("SELECT id,scopes::text,expires_at,COALESCE(revoked_at,0) "
             "FROM public.governance_project_keys WHERE tenant='" + TENANT +
             "' AND project='" + PROJECT + "' AND token_hash='" + digest + "'")
    result = subprocess.run(('psql', '-X', '-q', '-w', '-A', '-t', '-F', '|',
                             '-v', 'ON_ERROR_STOP=1', '-d', psql_dsn(binding), '-c', query),
                            env=psql_environment(binding), capture_output=True, text=True,
                            timeout=20, check=False)
    if result.returncode != 0:
        raise ValueError('Protected key validation unavailable')
    rows = [line.split('|') for line in result.stdout.splitlines() if line]
    if len(rows) != 1 or len(rows[0]) != 4:
        raise ValueError('New key not found in internal project')
    key_id, scopes, expiry, revoked = rows[0]
    if not re.fullmatch(r'key-[a-z0-9-]{36}', key_id) or \
            json.loads(scopes) != ['write'] or int(revoked) != 0 or \
            int(expiry) < int(time.time() * 1000) + 7 * 86400000:
        raise ValueError('Active write-only key with at least seven days required')
    return key_id


def main():
    if os.geteuid() != 0 or not os.isatty(0):
        raise ValueError('Interactive root terminal required')
    group = pwd.getpwnam('orvessian-chain-watch').pw_gid
    watcher = protected(WATCHER, 0o640, group)
    canary = protected(CANARY, 0o640, group)
    old_token = setting(watcher, 'ORVESSIAN_TOKEN_B64')
    if setting(canary, 'ORVESSIAN_TOKEN_B64') != old_token:
        raise ValueError('Existing watcher and canary keys differ')
    token = getpass.getpass('New SDK Receipt Smoke Test write-only key: ').strip()
    if not re.fullmatch(r'ovk_[a-f0-9]{64}', token):
        raise ValueError('Project write key required')
    key_id = verified_key(token)
    encoded = base64.b64encode(token.encode('ascii')).decode('ascii')
    del token
    original_watcher, original_canary = ''.join(watcher), ''.join(canary)
    try:
        atomic_write(WATCHER, replace_token(watcher, encoded), group)
        atomic_write(CANARY, replace_token(canary, encoded), group)
        checked = subprocess.run(('python3', CHECK, '--json'),
                                 capture_output=True, text=True, timeout=30,
                                 check=False)
        status = json.loads(checked.stdout) if checked.returncode == 0 else {}
        if status.get('active') is not True or \
                status.get('expiresInHours', 0) < 48:
            raise ValueError('Installed key verification failed')
    except (OSError, ValueError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        atomic_write(WATCHER, original_watcher, group)
        atomic_write(CANARY, original_canary, group)
        raise
    print('internal_canary_write_key=rotated;key_id=' + key_id + ';secrets=hidden')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired):
        print('Internal canary write-key rotation failed; prior configuration preserved.')
        raise SystemExit(1) from None
