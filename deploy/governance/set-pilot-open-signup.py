#!/usr/bin/env python3
"""Reversibly switch the hosted synthetic API from email list to open sign-up."""
import os
import pathlib
import stat
import subprocess
import sys
import tempfile

ENV = pathlib.Path('/etc/aichain-governance-synthetic-api.env')
BACKUP = pathlib.Path('/etc/aichain-governance-synthetic-api.env.pre-open-signup')
UNIT = 'aichain-governance-synthetic-api.service'
CLIENT = 'client_01M415264WYTWS294EMP8CNJNT'


def protected(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size > 16384:
        raise ValueError('Protected pilot API file required')
    return path.read_text(encoding='utf-8')


def atomic(path, content):
    fd, temporary = tempfile.mkstemp(prefix='.pilot-signup-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        os.fchown(fd, 0, 0)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def restart():
    subprocess.run(('systemctl', 'restart', UNIT), check=True, timeout=40,
                   stdout=subprocess.DEVNULL)
    subprocess.run(('systemctl', 'is-active', '--quiet', UNIT), check=True, timeout=10)


def main():
    if os.geteuid() != 0 or sys.argv[1:] not in (['--check'], ['--apply'], ['--rollback']):
        raise ValueError('Use --check, --apply or --rollback as root')
    current = protected(ENV)
    if 'GOVERNANCE_ENV=test\n' not in current or \
            'WORKOS_CLIENT_ID=' + CLIENT + '\n' not in current:
        raise ValueError('Unexpected pilot API identity')
    allow = [line for line in current.splitlines()
             if line.startswith('WORKOS_PILOT_ALLOWED_EMAILS=')]
    open_mode = 'WORKOS_ADMISSION_MODE=open-pilot\n' in current
    if sys.argv[1] == '--check':
        print('pilot_signup_mode=' + ('open' if open_mode and not allow else 'list'))
        return
    if sys.argv[1] == '--rollback':
        original = protected(BACKUP)
        if 'WORKOS_ADMISSION_MODE=open-pilot\n' in original or \
                not any(line.startswith('WORKOS_PILOT_ALLOWED_EMAILS=')
                        for line in original.splitlines()):
            raise ValueError('Invalid rollback configuration')
        atomic(ENV, original)
        restart()
        print('pilot_signup_mode=list')
        return
    if open_mode and not allow:
        print('pilot_signup_mode=open')
        return
    if len(allow) != 1 or open_mode or BACKUP.exists():
        raise ValueError('Unexpected admission configuration or backup')
    fd = os.open(BACKUP, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as stream:
        stream.write(current)
        stream.flush()
        os.fsync(stream.fileno())
    updated = current.replace(allow[0] + '\n', 'WORKOS_ADMISSION_MODE=open-pilot\n')
    atomic(ENV, updated)
    try:
        restart()
    except (OSError, subprocess.SubprocessError):
        atomic(ENV, current)
        restart()
        raise
    print('pilot_signup_mode=open')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.SubprocessError):
        print('Pilot signup mode change failed; inspect protected API configuration.',
              file=sys.stderr)
        raise SystemExit(1) from None
