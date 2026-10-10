#!/usr/bin/env python3
"""Add one operator-approved WorkOS waitlist email to the pilot API gate.

Run this on the VPS only after reviewing the pending entry in WorkOS. Approve
the entry in WorkOS after this command succeeds, so its invitation is usable.
"""

import argparse
import os
import re
import subprocess
import tempfile
from pathlib import Path

ENV_FILE = Path('/etc/aichain-governance-synthetic-api.env')
UNIT = 'aichain-governance-synthetic-api.service'
SETTING = 'WORKOS_PILOT_ALLOWED_EMAILS='
EMAIL = re.compile(r'^[A-Za-z0-9.!#$%&\'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$')


def updated(contents: str, address: str) -> tuple[str, bool]:
    lines = contents.splitlines(keepends=True)
    matches = [i for i, line in enumerate(lines) if line.startswith(SETTING)]
    if len(matches) != 1:
        raise ValueError('Expected exactly one pilot admission setting')
    i = matches[0]
    raw = lines[i][len(SETTING):].strip()
    if raw.startswith(('"', "'")) or not raw:
        raise ValueError('Unexpected pilot admission setting format')
    current = [part.strip().lower() for part in raw.split(',')]
    if any(not EMAIL.fullmatch(part) for part in current):
        raise ValueError('Invalid existing pilot admission setting')
    if address in current:
        return contents, False
    current.append(address)
    lines[i] = SETTING + ','.join(current) + ('\n' if lines[i].endswith('\n') else '')
    return ''.join(lines), True


def install(contents: bytes, stat: os.stat_result) -> None:
    descriptor, name = tempfile.mkstemp(prefix='.pilot-admission-', dir=ENV_FILE.parent)
    try:
        os.fchmod(descriptor, stat.st_mode & 0o777)
        os.fchown(descriptor, stat.st_uid, stat.st_gid)
        with os.fdopen(descriptor, 'wb') as stream:
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, ENV_FILE)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('email', help='Exact email shown on the approved WorkOS waitlist entry')
    args = parser.parse_args()
    address = args.email.strip().lower()
    if len(address) > 254 or not EMAIL.fullmatch(address) or '..' in address:
        parser.error('Invalid email address')
    if os.geteuid() != 0:
        parser.error('Run as root on the pilot VPS')
    stat = ENV_FILE.stat()
    if stat.st_uid != 0 or stat.st_mode & 0o077:
        raise SystemExit('Protected API configuration is not root-only')
    old = ENV_FILE.read_bytes()
    new, changed = updated(old.decode('utf-8'), address)
    if not changed:
        print('Pilot admission already contains this email; no restart needed.')
        return
    install(new.encode('utf-8'), stat)
    try:
        subprocess.run(['systemctl', 'restart', UNIT], check=True)
        subprocess.run(['systemctl', 'is-active', '--quiet', UNIT], check=True)
    except subprocess.CalledProcessError:
        install(old, stat)
        subprocess.run(['systemctl', 'restart', UNIT], check=False)
        raise SystemExit('API restart failed; prior admission list restored. Do not approve in WorkOS.')
    print('Pilot admission updated and API active. You may approve this exact email in WorkOS.')


if __name__ == '__main__':
    main()
