#!/usr/bin/env python3
"""Keep the hosted pilot API's public receipt trust list in sync with workers.

Only public recording addresses are added. The protected API env file is
rewritten atomically without printing or changing its credential values.
"""
import json
import os
import pathlib
import stat
import subprocess
import sys
import tempfile
from pilot_worker_registry import load_registry

ENV = pathlib.Path('/etc/aichain-governance-synthetic-api.env')
UNIT = 'aichain-governance-synthetic-api.service'


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in ([], ['--apply']):
        raise ValueError('Root and optional --apply required')
    workers = load_registry()
    signers = sorted({worker['recorder'].lower() for worker in workers})
    if len(signers) != len(workers):
        raise ValueError('Duplicate recording signer')
    info = ENV.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 16384:
        raise ValueError('Protected API configuration required')
    source = ENV.read_text(encoding='utf-8')
    lines = source.splitlines()
    current = [line for line in lines if line.startswith('GOVERNANCE_RECEIPT_SIGNERS=')]
    if len(current) != 1:
        raise ValueError('One signer setting required')
    old = json.loads(current[0].split('=', 1)[1].strip("'\""))
    if not isinstance(old, list) or not all(isinstance(x, str) for x in old):
        raise ValueError('Invalid existing signer setting')
    # Retired signers remain trusted for historical receipts unless a separate
    # reviewed key-compromise process removes them.
    combined = sorted(set(x.lower() for x in old) | set(signers))
    replacement = 'GOVERNANCE_RECEIPT_SIGNERS=' + json.dumps(combined, separators=(',', ':'))
    changed = current[0] != replacement
    if not changed:
        print(json.dumps({'changed': False, 'trustedSignerCount': len(combined)}))
        return
    if sys.argv[1:] != ['--apply']:
        print(json.dumps({'changed': True, 'trustedSignerCount': len(combined),
                          'applied': False}))
        return
    updated = '\n'.join(replacement if line == current[0] else line for line in lines) + '\n'
    fd, temporary = tempfile.mkstemp(prefix='.pilot-api-signers-', dir=ENV.parent)
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, 0, 0)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(updated)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, ENV)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    subprocess.run(('systemctl', 'restart', UNIT), check=True, timeout=40,
                   stdout=subprocess.DEVNULL)
    if subprocess.run(('systemctl', 'is-active', '--quiet', UNIT),
                      timeout=10).returncode != 0:
        raise ValueError('API did not restart')
    print(json.dumps({'changed': True, 'trustedSignerCount': len(combined),
                      'applied': True}))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, json.JSONDecodeError,
            subprocess.SubprocessError):
        print('Signer trust synchronization failed; inspect protected API and worker configuration.',
              file=sys.stderr)
        raise SystemExit(1) from None
