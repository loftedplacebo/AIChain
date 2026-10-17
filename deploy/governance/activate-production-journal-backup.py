#!/usr/bin/env python3
"""Switch the daily Production timer after an exact closed journal restore."""

import argparse
import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import stat
import subprocess
import time


HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    'journal_handoff', HERE / 'check-production-journal-handoff.py')
HANDOFF = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HANDOFF)
OLD = HANDOFF.OLD_TIMER
NEW = HANDOFF.NEW_TIMER
SERVICE = 'orvessian-production-journal-backup.service'
LOCK = pathlib.Path('/run/orvessian-production-backup-handoff.lock')
UNIT_DIR = pathlib.Path('/etc/systemd/system')
UNIT_HASHES = {
    NEW: '841e4b0aa922a316b0bc3fa0c23347f05e6e24bbc4fcec71d49a14ec90853aa3',
    SERVICE: '7c0c5f3191360b1dbdc8b80c2753b6bc12134899d922c81ee38d33547de0012b',
}


def command(*args, timeout=45):
    result = subprocess.run(args, capture_output=True, text=True,
                            timeout=timeout, check=False)
    if result.returncode:
        raise ValueError('Production backup timer transition failed: ' + args[0])
    return result.stdout.strip()


def unit_file(name):
    path = UNIT_DIR / name
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022:
        raise ValueError('Protected Production backup unit required')
    content = path.read_bytes().replace(b'\r\n', b'\n')
    if hashlib.sha256(content).hexdigest() != UNIT_HASHES[name]:
        raise ValueError('Production backup unit differs from reviewed template')


def preflight(backup_id):
    if os.geteuid() != 0:
        raise ValueError('Root required')
    workers = HANDOFF.preflight(backup_id)
    for name in (NEW, SERVICE):
        unit_file(name)
    return workers


def new_timer_healthy():
    return (HANDOFF.unit_state('is-active', OLD) != 'active' and
            HANDOFF.unit_state('is-enabled', OLD) == 'disabled' and
            HANDOFF.unit_state('is-active', NEW) == 'active' and
            HANDOFF.unit_state('is-enabled', NEW) == 'enabled')


def wait_for_first_run():
    # Persistent timers can start an overdue run immediately after activation.
    for attempt in range(120):
        if HANDOFF.unit_state('is-active', SERVICE) != 'active':
            return
        if attempt == 119:
            raise ValueError('First journal backup run did not finish')
        time.sleep(10)


def apply(backup_id):
    descriptor = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        info = os.fstat(descriptor)
        if info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError('Protected Production backup handoff lock required')
        fcntl.flock(descriptor, fcntl.LOCK_EX | fcntl.LOCK_NB)
        workers = preflight(backup_id)
        command('systemctl', 'disable', '--now', OLD)
        try:
            command('systemctl', 'enable', '--now', NEW)
            wait_for_first_run()
            if not new_timer_healthy():
                raise ValueError('Journal backup timer state failed acceptance')
            health = command('python3', str(HERE / 'check-production-journal-backup-health.py'),
                             timeout=90)
            if json.loads(health).get('healthy') is not True:
                raise ValueError('Journal backup coverage failed acceptance')
        except BaseException:
            command('systemctl', 'disable', '--now', NEW)
            command('systemctl', 'enable', '--now', OLD)
            raise ValueError('Production backup timer handoff rolled back; review coverage before admission') from None
        print('production_journal_backup=active;workers=' + str(workers) +
              ';prelaunch_timer=disabled')
    finally:
        os.close(descriptor)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backup-id', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    workers = preflight(args.backup_id)
    if args.apply:
        apply(args.backup_id)
    else:
        print(json.dumps({'ready': True, 'mode': 'read-only',
                          'workers': workers, 'from': OLD, 'to': NEW},
                         sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError,
            subprocess.TimeoutExpired, BlockingIOError):
        raise SystemExit('Production journal timer handoff failed; review private backup health') from None
