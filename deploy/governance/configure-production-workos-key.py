#!/usr/bin/env python3
"""Install a WorkOS Production API key through a hidden VPS terminal prompt."""

import getpass
import os
import pathlib
import re
import stat
import tempfile


ROOT = pathlib.Path('/etc/aichain/production')
DESTINATION = ROOT / 'workos.env'


def main():
    if os.geteuid() != 0:
        raise ValueError('Run as root on the Contabo VPS')
    if ROOT.exists():
        info = ROOT.lstat()
        if not stat.S_ISDIR(info.st_mode) or (os.name == 'posix' and
                                              (info.st_uid != 0 or info.st_mode & 0o077)):
            raise ValueError('Protected production directory required')
    else:
        ROOT.mkdir(mode=0o700)
    if DESTINATION.exists() or DESTINATION.is_symlink():
        raise ValueError('Production WorkOS key already installed; review before replacing it')
    key = getpass.getpass('WorkOS Production API key (sk_...): ')
    if not re.fullmatch(r'sk_[A-Za-z0-9_-]{20,1020}', key):
        raise ValueError('Invalid WorkOS API key format')
    fd, temporary = tempfile.mkstemp(prefix='.workos-', dir=ROOT)
    try:
        with os.fdopen(fd, 'w', encoding='ascii') as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write('WORKOS_API_KEY=' + key + '\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DESTINATION)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('WorkOS Production key stored root-only; no service activated.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError):
        raise SystemExit('WorkOS Production key installation failed; no secret printed') from None
