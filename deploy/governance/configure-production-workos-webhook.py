#!/usr/bin/env python3
"""Install the Production webhook signing secret through a hidden VPS prompt."""

import getpass
import os
import pathlib
import re
import stat
import subprocess
import tempfile


DESTINATION = pathlib.Path('/etc/aichain/production/workos.env')


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
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
    if not re.fullmatch(r'WORKOS_API_KEY=sk_[A-Za-z0-9_-]{20,1020}\n', existing):
        raise ValueError('Exactly one existing Production API key required')
    secret = getpass.getpass('WorkOS Production webhook secret (whsec_...): ')
    if not re.fullmatch(r'whsec_[A-Za-z0-9_-]{20,500}', secret):
        raise ValueError('Invalid WorkOS webhook signing secret')
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
    print('production_workos_webhook=installed;secret=hidden;service=off')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Production WorkOS webhook setup failed; no secret printed') from None
