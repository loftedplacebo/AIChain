#!/usr/bin/env python3
"""Prepare a distinct root-only production archive encryption key."""

import argparse
import hashlib
import os
import pathlib
import secrets
import stat


ROOT = pathlib.Path('/etc/aichain/production/backup')
KEY = ROOT / 'backup.key'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if os.geteuid() != 0 or not ROOT.parent.is_dir():
        raise ValueError('Protected production root required')
    parent = ROOT.parent.lstat()
    if parent.st_uid != 0 or not stat.S_ISDIR(parent.st_mode) or parent.st_mode & 0o077:
        raise ValueError('Protected production root required')
    if ROOT.exists() or ROOT.is_symlink():
        info = ROOT.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Protected backup key directory required')
    if KEY.exists() or KEY.is_symlink():
        raise ValueError('Production backup key already exists; never replace in place')
    if not args.apply:
        print('production_backup_key=ready;mode=read-only;pilot_key=untouched')
        return
    ROOT.mkdir(mode=0o700, exist_ok=True)
    key = secrets.token_hex(32)
    fd = os.open(KEY, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='ascii') as handle:
        handle.write(key + '\n')
        handle.flush()
        os.fsync(handle.fileno())
    print('production_backup_key=installed;root_only=true;'
          'fingerprint_sha256=' + hashlib.sha256(key.encode('ascii')).hexdigest())
    print('The key still requires independent escrow before backup acceptance.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError):
        raise SystemExit('Production backup key preparation failed; no secret printed') from None
