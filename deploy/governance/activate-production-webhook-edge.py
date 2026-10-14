#!/usr/bin/env python3
"""Open only the signed Production webhook route with checked rollback."""

import argparse
import hashlib
import os
import pathlib
import re
import stat
import subprocess
import time


SITE = pathlib.Path('/etc/nginx/sites-available/orvessian-production-preparation')
ENABLED = pathlib.Path('/etc/nginx/sites-enabled/orvessian-production-preparation')
CANDIDATE = pathlib.Path('/etc/nginx/sites-available/orvessian-production-webhook-only.candidate')
BACKUP = pathlib.Path('/etc/nginx/sites-available/orvessian-production-preparation.before-webhook-ed1f0f7')
OLD_SHA256 = 'bd48274eea96d6174d0a1702efe5b77d811a6ebdcd03da34b8f7e5150c4e9a8b'
NEW_SHA256 = 'be2f4fc7b79516a2bbb658260d19067035d934a1d6fce4abb904affd2d86c933'
PRIVATE_PROBE = '/opt/aichain/governance-pilot-db-setup/check-production-webhook-private.py'


def checked_file(path, digest):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or info.st_size > 16384:
        raise ValueError('Protected Nginx configuration required')
    if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('Nginx configuration hash mismatch')


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True,
                            timeout=20, check=False)
    return result.returncode == 0


def public_status(host, path, *, post=False):
    args = ['curl', '--silent', '--show-error', '--max-time', '5',
            '--output', '/dev/null', '--write-out', '%{http_code}',
            '--resolve', host + ':443:127.0.0.1']
    if post:
        args.extend(('--header', 'Content-Type: application/json',
                     '--data', '{}'))
    result = subprocess.run((*args, 'https://' + host + path),
                            capture_output=True, text=True, timeout=10,
                            check=False)
    if result.returncode or not re.fullmatch(r'[1-5][0-9]{2}', result.stdout):
        return 0
    return int(result.stdout)


def expected_edge(webhook_status):
    for _ in range(5):
        values = {
            'webhook': public_status('api-prod.orvessian.com',
                                     '/v1/auth/workos-webhook', post=True),
            'apiHealth': public_status('api-prod.orvessian.com', '/health'),
            'apiSession': public_status('api-prod.orvessian.com', '/v1/session'),
            'portal': public_status('prod.orvessian.com', '/'),
        }
        if values == {'webhook': webhook_status, 'apiHealth': 404,
                      'apiSession': 404, 'portal': 404}:
            return True
        time.sleep(0.2)
    return False


def replace_with(source):
    temporary = SITE.with_name('.orvessian-production-webhook-next')
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Nginx staging file requires review')
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    try:
        with os.fdopen(descriptor, 'wb') as output:
            output.write(source.read_bytes())
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, SITE)
    finally:
        if temporary.exists():
            temporary.unlink()


def base_checks():
    if os.geteuid() != 0 or not ENABLED.is_symlink() or \
            os.readlink(ENABLED) != str(SITE):
        raise ValueError('Root and exact Production Nginx symlink required')
    if not command('nginx', '-t'):
        raise ValueError('Existing Nginx config is invalid')
    if not command('python3', PRIVATE_PROBE):
        raise ValueError('Private Production API probe failed')


def apply():
    base_checks()
    checked_file(SITE, OLD_SHA256)
    checked_file(CANDIDATE, NEW_SHA256)
    if BACKUP.exists() or BACKUP.is_symlink():
        raise ValueError('Existing webhook rollback file requires review')
    descriptor = os.open(BACKUP, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(descriptor, 'wb') as output:
        output.write(SITE.read_bytes())
        output.flush()
        os.fsync(output.fileno())
    try:
        replace_with(CANDIDATE)
        if not command('nginx', '-t') or \
                not command('systemctl', 'reload', 'nginx') or \
                not expected_edge(401):
            raise ValueError('Production webhook edge check failed')
    except Exception:
        replace_with(BACKUP)
        if not command('nginx', '-t') or \
                not command('systemctl', 'reload', 'nginx') or \
                not expected_edge(404):
            raise ValueError('Production webhook rollback requires operator review') from None
        raise
    print('production_webhook_edge=active;webhook=401_unsigned;other_routes=404;rollback=ready')


def rollback():
    base_checks()
    checked_file(SITE, NEW_SHA256)
    checked_file(BACKUP, OLD_SHA256)
    replace_with(BACKUP)
    if not command('nginx', '-t') or \
            not command('systemctl', 'reload', 'nginx') or \
            not expected_edge(404):
        raise ValueError('Production webhook rollback requires operator review')
    print('production_webhook_edge=closed;webhook=404;other_routes=404')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    if args.apply and args.rollback:
        raise ValueError('Select one operation')
    if args.rollback:
        rollback()
    elif args.apply:
        apply()
    else:
        base_checks()
        checked_file(SITE, OLD_SHA256)
        checked_file(CANDIDATE, NEW_SHA256)
        if BACKUP.exists() or BACKUP.is_symlink() or not expected_edge(404):
            raise ValueError('Closed Production edge prerequisite failed')
        print('production_webhook_edge=ready;mode=read-only;current=404')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Production webhook edge change failed; inspect Nginx and service state') from None
