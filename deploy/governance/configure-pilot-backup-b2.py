#!/usr/bin/env python3
"""Install the pilot's bucket-scoped upload credential from hidden prompts."""

import getpass
import hmac
import json
import os
import pathlib
import re
import tempfile


ROOT = pathlib.Path('/etc/aichain/pilot-backup')
KEY = ROOT / 'backup.key'
DESTINATION = ROOT / 'b2-upload-credentials.json'


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    expected = KEY.read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[a-f0-9]{64}', expected):
        raise SystemExit('Root-only archive key is missing or invalid')

    key_id = input('1Password B2 upload keyID: ').strip()
    secret = getpass.getpass('1Password B2 upload applicationKey: ').strip()
    escrow = getpass.getpass('1Password B2 archive encryption key: ').strip()
    if not re.fullmatch(r'[A-Za-z0-9]{12,64}', key_id):
        raise SystemExit('Invalid B2 key ID format')
    if not re.fullmatch(r'[!-~]{20,128}', secret):
        raise SystemExit('Invalid B2 application key format '
                         f'(length {len(secret)}; expected 20–128 printable ASCII characters). '
                         'No credential installed.')
    if not hmac.compare_digest(escrow, expected):
        raise SystemExit('Archive encryption key DOES NOT MATCH; no credential installed')

    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(ROOT, 0o700)
    fd, temporary = tempfile.mkstemp(prefix='.b2-upload-', dir=ROOT)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump({'accessKeyId': key_id, 'secretAccessKey': secret}, handle)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, DESTINATION)
        os.chmod(DESTINATION, 0o600)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Archive encryption key: MATCH')
    print('Root-only B2 upload credential installed; no secret printed.')


if __name__ == '__main__':
    main()
