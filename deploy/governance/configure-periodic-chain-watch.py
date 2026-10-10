#!/usr/bin/env python3
"""Install bounded watcher credentials from a JSON stdin payload, never argv."""
import base64
import binascii
import json
import os
import pathlib
import pwd
import re
import sys
import tempfile

DEST = pathlib.Path('/etc/orvessian-chain-watch.env')
SERVICE = 'orvessian-chain-watch'


def main():
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    if DEST.exists():
        raise SystemExit('Agent environment already exists; inspect before replacing')
    payload = json.load(sys.stdin)
    fields = {'openaiKeyB64', 'orvessianTokenB64', 'tenant', 'project'}
    if not isinstance(payload, dict) or set(payload) != fields:
        raise SystemExit('Invalid configuration payload')
    try:
        openai_key = base64.b64decode(payload['openaiKeyB64'], validate=True)
        orvessian_token = base64.b64decode(payload['orvessianTokenB64'], validate=True)
    except (binascii.Error, TypeError):
        raise SystemExit('Invalid secret encoding') from None
    if not openai_key.startswith(b'sk-') or not 32 <= len(orvessian_token) <= 512:
        raise SystemExit('Invalid API credential')
    if any(c < 32 or c > 126 for c in openai_key + orvessian_token):
        raise SystemExit('Invalid API credential characters')
    ref = re.compile(r'[A-Za-z0-9._:-]{1,128}\Z')
    if any(not isinstance(payload[k], str) or not ref.fullmatch(payload[k])
           for k in ('tenant', 'project')):
        raise SystemExit('Invalid project references')
    group = pwd.getpwnam(SERVICE).pw_gid
    lines = {
        'OPENAI_API_KEY_B64': payload['openaiKeyB64'],
        'OPENAI_MODEL': 'gpt-4.1-mini',
        'ORVESSIAN_API_URL': 'https://api.orvessian.com',
        'ORVESSIAN_TOKEN_B64': payload['orvessianTokenB64'],
        'ORVESSIAN_TENANT': payload['tenant'],
        'ORVESSIAN_PROJECT': payload['project'],
        'AGENT_STATE_FILE': '/var/lib/orvessian-chain-watch/state.json',
    }
    fd, temporary = tempfile.mkstemp(prefix='.orvessian-chain-watch.', dir='/etc')
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as stream:
            for key, value in lines.items():
                stream.write(key + '=' + value + '\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.chown(temporary, 0, group)
        os.chmod(temporary, 0o640)
        os.replace(temporary, DEST)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Agent environment installed with root/service-only access.')


if __name__ == '__main__':
    main()
