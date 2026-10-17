#!/usr/bin/env python3
"""Swap an active webhook-only Production API release with checked rollback."""

import argparse
import fcntl
import importlib.util
import json
import os
import pathlib
import re
import subprocess
import time


HERE = pathlib.Path(__file__).resolve().parent
SOURCE = HERE / 'replace-production-api-release.py'
SPEC = importlib.util.spec_from_file_location('production_api_replace', SOURCE)
REPLACE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REPLACE)
UNIT = 'orvessian-production-api.service'
LOCK = pathlib.Path('/run/orvessian-production-api-release.lock')
PRIVATE = HERE / 'check-production-webhook-private.py'
BACKUP = HERE / 'check-production-prelaunch-backup-health.py'
PILOT = HERE / 'check-pilot-hosted-health.py'
EDGE = HERE / 'activate-production-webhook-edge.py'


def command(*args, timeout=60):
    result = subprocess.run(args, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise ValueError('Production API release command failed: ' + args[0])
    return result.stdout.strip()


def unit_state():
    return set(command('systemctl', 'show', UNIT, '-p', 'UnitFileState',
                       '-p', 'ActiveState', timeout=15).splitlines())


def healthy(script):
    result = subprocess.run(('python3', str(script)), capture_output=True,
                            text=True, timeout=60, check=False)
    if result.returncode or json.loads(result.stdout).get('healthy') is not True:
        raise ValueError('Production API release health check failed: ' + script.name)


def public_edge():
    spec = importlib.util.spec_from_file_location('production_webhook_edge', EDGE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    if not module.expected_edge(401):
        raise ValueError('Webhook-only Production public edge changed')


def check_live():
    if unit_state() != {'UnitFileState=enabled', 'ActiveState=active'}:
        raise ValueError('Active and enabled Production API required')
    for check in (PRIVATE, BACKUP, PILOT):
        healthy(check)
    public_edge()


def wait_live():
    for attempt in range(8):
        try:
            check_live()
            return
        except (OSError, ValueError, json.JSONDecodeError, subprocess.TimeoutExpired):
            if attempt == 7:
                raise
            time.sleep(1)


def preflight(archive, digest, commit, previous):
    if os.geteuid() != 0 or not all(
            isinstance(value, str) and re.fullmatch(r'[a-f0-9]{40}', value)
            for value in (commit, previous)) or commit == previous:
        raise ValueError('Root and distinct exact source commits required')
    count = REPLACE.STAGE.inspect_archive(archive, digest)
    REPLACE.manifest(REPLACE.RELEASE, previous)
    backup = REPLACE.RELEASE.with_name(
        REPLACE.RELEASE.name + '.previous-' + previous[:12])
    if backup.exists() or backup.is_symlink() or commit == previous:
        raise ValueError('Production API rollback path already used')
    check_live()
    return count


def apply(archive, digest, commit, previous):
    descriptor = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Protected Production API release lock required')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        preflight(archive, digest, commit, previous)
        command('systemctl', 'disable', '--now', UNIT, timeout=45)
        try:
            REPLACE.replace(archive, digest, commit, previous)
            command('systemctl', 'enable', '--now', UNIT, timeout=45)
            wait_live()
        except BaseException:
            command('systemctl', 'disable', '--now', UNIT, timeout=45)
            try:
                REPLACE.manifest(REPLACE.RELEASE, commit)
            except (OSError, ValueError, KeyError, TypeError):
                REPLACE.manifest(REPLACE.RELEASE, previous)
            else:
                REPLACE.rollback(commit, previous)
            command('systemctl', 'enable', '--now', UNIT, timeout=45)
            wait_live()
            raise ValueError('Production API release rolled back after failed acceptance') from None
        print('production_api_release=active;commit=' + commit[:12] +
              ';rollback=' + previous[:12] + ';edge=webhook_only')
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--archive', type=pathlib.Path, required=True)
    parser.add_argument('--sha256', required=True)
    parser.add_argument('--commit', required=True)
    parser.add_argument('--previous', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    count = preflight(args.archive, args.sha256, args.commit, args.previous)
    if args.apply:
        apply(args.archive, args.sha256, args.commit, args.previous)
    else:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'archiveMembers': count, 'currentCommit': args.previous,
                          'nextCommit': args.commit, 'edge': 'webhook_only'},
                         sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError,
            subprocess.TimeoutExpired, BlockingIOError):
        raise SystemExit('Active Production API release failed; inspect the '
                         'private service and webhook-only edge') from None
