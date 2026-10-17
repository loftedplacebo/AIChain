#!/usr/bin/env python3
"""Open and roll back the narrow Production owner sign-in preview."""

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
CANDIDATE = pathlib.Path('/etc/nginx/sites-available/orvessian-production-owner-preview.candidate')
BACKUP = pathlib.Path('/etc/nginx/sites-available/orvessian-production-webhook-only.before-owner-preview')
OLD_SHA256 = 'be2f4fc7b79516a2bbb658260d19067035d934a1d6fce4abb904affd2d86c933'
NEW_SHA256 = '8ecaa31f22691e23d83723c5b77254ac0e36c8c11410d6bad90444d2528ede4d'
PORTAL = 'orvessian-production-portal.service'
API = 'orvessian-production-api.service'
PRODUCTION_HEALTH = '/opt/aichain/governance-pilot-db-setup/check-production-prelaunch-backup-health.py'
PILOT_HEALTH = '/opt/aichain/governance-pilot-db-setup/check-pilot-hosted-health.py'


def checked_file(path, digest):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            info.st_mode & 0o022 or info.st_size > 16384 or \
            hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        raise ValueError('Protected Nginx configuration mismatch')


def run(*args, timeout=25):
    result = subprocess.run(args, capture_output=True, text=True,
                            timeout=timeout, check=False)
    return result.returncode == 0


def status(host, path, *, post=False):
    args = ['curl', '--silent', '--show-error', '--max-time', '6',
            '--output', '/dev/null', '--write-out', '%{http_code}',
            '--resolve', host + ':443:127.0.0.1']
    if post:
        args.extend(('--header', 'Content-Type: application/json', '--data', '{}'))
    result = subprocess.run((*args, 'https://' + host + path),
                            capture_output=True, text=True,
                            timeout=9, check=False)
    if result.returncode or not re.fullmatch(r'[1-5][0-9]{2}', result.stdout):
        return 0
    return int(result.stdout)


def edge_is(expected):
    for _ in range(5):
        observed = {
            'portal': status('prod.orvessian.com', '/workspace'),
            'authStatus': status('api-prod.orvessian.com', '/v1/auth/status'),
            'session': status('api-prod.orvessian.com', '/v1/session'),
            'project': status('api-prod.orvessian.com', '/v1/workspaces'),
            'keys': status('api-prod.orvessian.com', '/v1/keys'),
            'health': status('api-prod.orvessian.com', '/health'),
            'webhook': status('api-prod.orvessian.com',
                              '/v1/auth/workos-webhook', post=True),
        }
        if observed == expected:
            return True
        time.sleep(0.2)
    return False


CLOSED = {'portal': 404, 'authStatus': 404, 'session': 404,
          'project': 404, 'keys': 404, 'health': 404, 'webhook': 401}
PREVIEW = {'portal': 200, 'authStatus': 200, 'session': 401,
           'project': 404, 'keys': 404, 'health': 404, 'webhook': 401}


def prerequisites():
    if os.geteuid() != 0 or not ENABLED.is_symlink() or \
            os.readlink(ENABLED) != str(SITE):
        raise ValueError('Root and exact Production Nginx symlink required')
    if not run('nginx', '-t') or not run('systemctl', 'is-active', '--quiet', API) or \
            not run('systemctl', 'is-enabled', '--quiet', API) or \
            run('systemctl', 'is-enabled', '--quiet', PORTAL) or \
            not run('python3', PRODUCTION_HEALTH) or \
            not run('python3', PILOT_HEALTH):
        raise ValueError('Production, pilot or service preflight failed')


def replace_with(source):
    temporary = SITE.with_name('.orvessian-production-owner-preview-next')
    if temporary.exists() or temporary.is_symlink():
        raise ValueError('Production Nginx staging file requires review')
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


def private_portal_ready():
    result = subprocess.run(
        ['curl', '--silent', '--show-error', '--max-time', '8',
         '--output', '/dev/null', '--write-out', '%{http_code}',
         '--header', 'Host: prod.orvessian.com',
         'http://127.0.0.1:3003/workspace'],
        capture_output=True, text=True, timeout=10, check=False)
    return result.returncode == 0 and result.stdout == '200'


def apply():
    prerequisites()
    checked_file(SITE, OLD_SHA256)
    checked_file(CANDIDATE, NEW_SHA256)
    if BACKUP.exists() or BACKUP.is_symlink() or \
            not edge_is(CLOSED) or run('systemctl', 'is-active', '--quiet', PORTAL):
        raise ValueError('Closed Production preview prerequisite failed')
    if not run('systemctl', 'start', PORTAL):
        run('systemctl', 'stop', PORTAL)
        raise ValueError('Private Production portal failed to start')
    try:
        if not private_portal_ready():
            raise ValueError('Private Production portal is not ready')
        descriptor = os.open(BACKUP, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, 'wb') as output:
            output.write(SITE.read_bytes())
            output.flush()
            os.fsync(output.fileno())
        replace_with(CANDIDATE)
        if not run('nginx', '-t') or not run('systemctl', 'reload', 'nginx') or \
                not edge_is(PREVIEW):
            raise ValueError('Production owner preview edge check failed')
    except Exception:
        if BACKUP.is_file():
            replace_with(BACKUP)
            if not run('nginx', '-t') or not run('systemctl', 'reload', 'nginx') or \
                    not edge_is(CLOSED):
                raise ValueError('Production preview rollback needs operator review') from None
        run('systemctl', 'stop', PORTAL)
        raise
    print('production_owner_preview=active;customer_api=closed;project_creation=closed;rollback=ready')


def rollback():
    prerequisites()
    checked_file(SITE, NEW_SHA256)
    checked_file(BACKUP, OLD_SHA256)
    replace_with(BACKUP)
    if not run('nginx', '-t') or not run('systemctl', 'reload', 'nginx') or \
            not edge_is(CLOSED) or not run('systemctl', 'stop', PORTAL):
        raise ValueError('Production owner preview rollback needs operator review')
    print('production_owner_preview=closed;webhook=active;customer_api=closed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    if args.apply and args.rollback:
        raise ValueError('Select one operation')
    if args.apply:
        apply()
    elif args.rollback:
        rollback()
    else:
        prerequisites()
        checked_file(SITE, OLD_SHA256)
        checked_file(CANDIDATE, NEW_SHA256)
        if BACKUP.exists() or BACKUP.is_symlink() or not edge_is(CLOSED) or \
                run('systemctl', 'is-active', '--quiet', PORTAL):
            raise ValueError('Closed Production preview prerequisite failed')
        print('production_owner_preview=ready;customer_api=closed;portal=off')


if __name__ == '__main__':
    main()
