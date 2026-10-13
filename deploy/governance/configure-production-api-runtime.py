#!/usr/bin/env python3
"""Add the reviewed closed-admission production API settings without starting it."""

import argparse
import os
import pathlib
import re
import stat
import subprocess
import tempfile


DESTINATION = pathlib.Path('/etc/orvessian-production-api.env')
BASE_FIELDS = {'GOVERNANCE_DATABASE_URL', 'GOVERNANCE_DATABASE_CA_FILE',
               'GOVERNANCE_IDENTITY_SEAL_KEY'}
RUNTIME = {
    'GOVERNANCE_ENV': 'prod',
    'GOVERNANCE_PRODUCTION_HOST': 'contabo-shared',
    'GOVERNANCE_STORAGE': 'postgres',
    'GOVERNANCE_KEY_STORAGE': 'postgres',
    'GOVERNANCE_CONTROL_STORAGE': 'postgres',
    'GOVERNANCE_IDENTITY_PROVIDER': 'workos',
    'WORKOS_CLIENT_ID': 'client_01M3MRQT8SN9VYRYGQBJWDXAP1',
    'WORKOS_REDIRECT_URI': 'https://prod.orvessian.com/api/auth/callback',
    'WORKOS_ADMISSION_MODE': 'production-list',
    'WORKOS_PRODUCTION_ALLOWED_EMAILS': 'mjgrant@live.co.uk',
    'PORT': '8791',
}


def inspect():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = DESTINATION.lstat()
    if not stat.S_ISREG(info.st_mode) or \
            (os.name == 'posix' and (info.st_uid != 0 or info.st_mode & 0o077)) or \
            info.st_size > 8192:
        raise ValueError('Protected production environment file required')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          capture_output=True, text=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled')
    existing = DESTINATION.read_text(encoding='utf-8')
    lines = existing.splitlines()
    if not lines or any(not re.fullmatch(r'[A-Z_]+=[^\r\n]*', line) for line in lines):
        raise ValueError('Unexpected production environment format')
    fields = [line.split('=', 1)[0] for line in lines]
    if len(fields) != len(set(fields)) or set(fields) != BASE_FIELDS:
        raise ValueError('Production environment requires exactly the reviewed base fields')
    if any(not line.split('=', 1)[1] for line in lines):
        raise ValueError('Missing protected base value')
    return existing


def install(existing):
    payload = existing.rstrip('\n') + '\n' + ''.join(
        f'{name}={value}\n' for name, value in RUNTIME.items())
    fd, temporary = tempfile.mkstemp(prefix='.orvessian-production-',
                                      dir=DESTINATION.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            os.fchmod(output.fileno(), 0o600)
            output.write(payload)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, DESTINATION)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('production_api_runtime=closed_admission_installed;service=off;webhook=unconfigured')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    existing = inspect()
    if args.apply:
        install(existing)
    else:
        print('production_api_runtime=ready;mode=read-only;service=off')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Production API runtime installation failed; no secret printed') from None
