#!/usr/bin/env python3
"""Register the already-reviewed hosted Synthetic Validation worker once."""

import json
import fcntl
import os
import pathlib
import sqlite3
import stat
import subprocess
import tempfile
from contextlib import closing
from pilot_worker_registry import (REGISTRY, LOCK, LEGACY_UNIT, LEGACY_JOURNAL,
                                   load_registry, validate_registry)

KEYS = pathlib.Path('/var/lib/aichain-governance-pilot-worker/keys')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
SCRIPT = """const fs=require('node:fs'),{Wallet}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
console.log(JSON.stringify(process.argv.slice(1).map(f=>new Wallet(fs.readFileSync(f,'utf8').trim()).address)));"""


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    lock_fd = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    lock_info = os.fstat(lock_fd)
    if lock_info.st_uid != 0 or lock_info.st_mode & 0o077:
        raise ValueError('Protected registry lock required')
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    journal = pathlib.Path(LEGACY_JOURNAL)
    with closing(sqlite3.connect('file:' + str(journal) + '?mode=ro', uri=True)) as db:
        if db.execute('SELECT name FROM governance_environment').fetchone() != ('test',):
            raise ValueError('Legacy worker journal is not test-bound')
    key_files = [KEYS / 'recording-service.key', KEYS / 'relayer.key']
    for key in key_files:
        info = key.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            raise ValueError('Protected legacy worker key required')
    result = subprocess.run((NODE, '-e', SCRIPT, *(str(key) for key in key_files)),
                            check=True, capture_output=True, text=True, timeout=10)
    recorder, relayer = json.loads(result.stdout)
    entry = {'tenant': 'org-831aa048-b268-4fce-98f3-455429034ef8',
             'project': 'prj-d9109260-1232-4561-ab4a-ab2e5c8f658f',
             'role': 'worker', 'unit': LEGACY_UNIT, 'journal': LEGACY_JOURNAL,
             'state': 'active', 'recorder': recorder, 'relayer': relayer}
    if REGISTRY.exists():
        workers = load_registry()
        if entry not in workers:
            raise ValueError('Legacy worker binding differs from protected registry')
        print('Legacy worker already registered; no change.')
        return
    document = {'version': 1, 'environment': 'test', 'workers': [entry]}
    validate_registry(document)
    REGISTRY.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.pilot-workers-', dir=REGISTRY.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(document, handle, sort_keys=True)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, REGISTRY)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print('Legacy worker registered; review backup and health coverage before adding projects.')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, sqlite3.Error,
            subprocess.CalledProcessError, subprocess.TimeoutExpired):
        raise SystemExit('Legacy registry bootstrap failed; inspect protected worker state.') from None
