#!/usr/bin/env python3
"""Enable the tested hosted worker after a confirmed one-attempt pilot anchor."""
import os
import pathlib
import sqlite3
import stat
import subprocess
import tempfile
import json


ENV = pathlib.Path('/etc/aichain-governance-pilot-worker.env')
JOURNAL = pathlib.Path('/var/lib/aichain-governance-pilot-worker/worker.sqlite')
UNIT = 'aichain-governance-pilot-evidence-worker.service'
BATCH = '0x974b165f5298b37177e2972349a7553e0ad5a55502036501fa729dd7f930d88a'
TX = '0x942271d212d47d33c12b13a71c28231441ee19787c38f40af420e41ded721c25'


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit('Run as root')
    config = ENV.read_text(encoding='utf-8')
    if config.count('GOVERNANCE_WORKER_ENABLED=false\n') != 1:
        raise SystemExit('Expected exactly one paused worker setting')
    with sqlite3.connect(f'file:{JOURNAL}?mode=ro', uri=True) as db:
        rows = [json.loads(body) for (body,) in db.execute('SELECT body FROM jobs')]
        stage = db.execute('SELECT name FROM governance_environment').fetchone()
    if stage != ('test',) or len(rows) != 1 or rows[0].get('id') != BATCH or \
            rows[0].get('hash') != TX or rows[0].get('state') != 'confirmed' or \
            rows[0].get('attempts') != 1:
        raise SystemExit('Confirmed one-attempt hosted journal required')
    metadata = ENV.stat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or \
            stat.S_IMODE(metadata.st_mode) != 0o640:
        raise SystemExit('Protected worker environment file required')
    updated = config.replace('GOVERNANCE_WORKER_ENABLED=false\n',
                             'GOVERNANCE_WORKER_ENABLED=true\n')
    fd, name = tempfile.mkstemp(prefix='.aichain-governance-pilot-worker.',
                                 dir=ENV.parent)
    try:
        os.fchmod(fd, 0o640)
        os.fchown(fd, 0, metadata.st_gid)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(updated)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(name, ENV)
    finally:
        if os.path.exists(name):
            os.unlink(name)
    subprocess.run(('systemctl', 'enable', '--now', UNIT), check=True,
                   timeout=45, stdout=subprocess.DEVNULL)
    subprocess.run(('systemctl', 'is-active', '--quiet', UNIT), check=True,
                   timeout=15)
    print('Hosted evidence worker: ACTIVE AND ENABLED')
    print('Reviewed synthetic batch:', BATCH)
    print('Confirmed transaction:', TX)


if __name__ == '__main__':
    main()
