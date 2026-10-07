#!/usr/bin/env python3
"""Install protected internal canary config with a hidden read-key prompt.

The existing project-scoped write key is reused from its protected VPS file.
No secret value is echoed or added to a process command line.
"""
import base64
import getpass
import json
import os
import pathlib
import pwd
import re
import stat
import sys
import tempfile

DEST = pathlib.Path('/etc/orvessian-internal-responses-canary.env')
STATE = pathlib.Path('/var/lib/orvessian-internal-responses-canary')
REGISTRY = pathlib.Path('/etc/aichain/pilot-workers.json')
TENANT = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37'
PROJECT = 'prj-1e8d2ecd-6bbf-4cb6-b49b-fb599ba9626c'


def parse(stream):
    values = {}
    for line in stream:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        name, equal, value = line.strip().partition('=')
        if not equal or name not in {'ORVESSIAN_TENANT', 'ORVESSIAN_PROJECT',
                                     'ORVESSIAN_TOKEN_B64', 'AGENT_STATE_FILE'} or name in values:
            raise ValueError('Invalid protected internal configuration')
        values[name] = value.strip().strip('"').strip("'")
    if values.get('ORVESSIAN_TENANT') != TENANT or \
            values.get('ORVESSIAN_PROJECT') != PROJECT or \
            not re.fullmatch(r'[A-Za-z0-9+/]+={0,2}', values.get('ORVESSIAN_TOKEN_B64', '')):
        raise ValueError('Internal project scope and keys required')
    if not re.fullmatch(r'ovk_[a-f0-9]{64}', base64.b64decode(values['ORVESSIAN_TOKEN_B64']).decode()):
        raise ValueError('Protected write key invalid')
    return values


def main():
    if os.geteuid() != 0 or not sys.stdin.isatty():
        raise ValueError('Run at an interactive root terminal')
    source = pathlib.Path('/etc/orvessian-chain-watch.env')
    identity = pwd.getpwnam('orvessian-chain-watch')
    info = source.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_gid != identity.pw_gid or stat.S_IMODE(info.st_mode) != 0o640:
        raise ValueError('Protected existing OpenAI key required')
    internal = pathlib.Path('/etc/orvessian-chain-watch-internal.env')
    state_info = internal.lstat()
    if not stat.S_ISREG(state_info.st_mode) or state_info.st_uid != 0 or \
            state_info.st_gid != identity.pw_gid or stat.S_IMODE(state_info.st_mode) != 0o640:
        raise ValueError('Protected internal project configuration required')
    values = parse(internal.read_text(encoding='ascii').splitlines())
    read_token = getpass.getpass('SDK Receipt Smoke Test read-only key: ').strip()
    if not re.fullmatch(r'ovk_[a-f0-9]{64}', read_token):
        raise ValueError('Read-only project key required')
    registry = json.loads(REGISTRY.read_text(encoding='utf-8'))
    workers = [worker for worker in registry['workers'] if
               worker['tenant'] == TENANT and worker['project'] == PROJECT and
               worker['state'] == 'active']
    if len(workers) != 1 or not re.fullmatch(r'0x[a-fA-F0-9]{40}', workers[0]['recorder']):
        raise ValueError('One active internal project worker required')
    STATE.mkdir(mode=0o700, exist_ok=True)
    info = STATE.lstat()
    if not stat.S_ISDIR(info.st_mode) or STATE.is_symlink() or \
            stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError('Private state directory required')
    os.chown(STATE, identity.pw_uid, identity.pw_gid)
    lines = {
        'ORVESSIAN_TOKEN_B64': values['ORVESSIAN_TOKEN_B64'],
        'ORVESSIAN_READ_TOKEN_B64': base64.b64encode(read_token.encode()).decode(),
        'ORVESSIAN_TENANT': TENANT,
        'ORVESSIAN_PROJECT': PROJECT,
        'CANARY_STATE_FILE': str(STATE / 'state.json'),
        'CANARY_NODE': '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node',
        'CANARY_VERIFY_SCRIPT': '/opt/aichain/governance-pilot-worker/scripts/governance-evidence.cjs',
        'GOVERNANCE_RECEIPT_SIGNERS': "'" + json.dumps([workers[0]['recorder']]) + "'",
        'GOVERNANCE_EVIDENCE_RPC_URL': 'https://sepolia.base.org',
    }
    fd, temporary = tempfile.mkstemp(prefix='.orvessian-canary-', dir='/etc')
    try:
        os.fchmod(fd, 0o640)
        os.fchown(fd, 0, identity.pw_gid)
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            for name, value in lines.items():
                stream.write(name + '=' + value + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, DEST)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Internal canary configuration installed; no secrets printed.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        raise SystemExit('Canary setup failed; inspect protected input and project binding.') from None
