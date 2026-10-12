#!/usr/bin/env python3
"""Install one production B2 credential from hidden VPS prompts."""

import argparse
import getpass
import json
import os
import pathlib
import re
import stat
import tempfile


ROOT = pathlib.Path('/etc/aichain/production/backup')
DESTINATIONS = {
    'upload': ROOT / 'b2-upload-credentials.json',
    'restore': ROOT / 'b2-restore-credentials.json',
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('kind', choices=DESTINATIONS)
    args = parser.parse_args()
    destination = DESTINATIONS[args.kind]
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = ROOT.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
        raise ValueError('Protected production backup directory required')
    if destination.exists() or destination.is_symlink():
        raise ValueError('Production B2 credential already installed')

    key_id = input(f'Production B2 {args.kind} keyID: ').strip()
    secret = getpass.getpass(f'Production B2 {args.kind} applicationKey: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9]{12,64}', key_id) or \
            not re.fullmatch(r'[!-~]{20,128}', secret):
        raise ValueError('Invalid B2 key format')

    fd, temporary = tempfile.mkstemp(prefix='.production-b2-', dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump({'accessKeyId': key_id, 'secretAccessKey': secret}, handle)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.link(temporary, destination, follow_symlinks=False)
        os.unlink(temporary)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f'production_b2_{args.kind}=installed;scope=review_in_backblaze;secret=hidden')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError):
        raise SystemExit('Production B2 credential installation failed; no secret printed') from None
