"""Validated inventory of every hosted synthetic-pilot evidence worker."""

import hashlib
import json
import os
import re
import stat
import sqlite3
from contextlib import closing
from pathlib import Path

REGISTRY = Path('/etc/aichain/pilot-workers.json')
LOCK = Path('/etc/aichain/pilot-workers.lock')
LEGACY_UNIT = 'aichain-governance-pilot-evidence-worker.service'
LEGACY_JOURNAL = '/var/lib/aichain-governance-pilot-worker/worker.sqlite'
TENANT = re.compile(r'^org-[a-z0-9-]{36}$')
PROJECT = re.compile(r'^prj-[a-z0-9-]{36}$')
INSTANCE = re.compile(r'^[a-f0-9]{24}$')
ADDRESS = re.compile(r'^0x[a-fA-F0-9]{40}$')
CONTRACT = '0x5781540e4682a9d35011c94a25f615e438e8e7af'
MAX_WORKERS = 30


def instance_for(tenant: str, project: str) -> str:
    if not TENANT.fullmatch(tenant) or not PROJECT.fullmatch(project):
        raise ValueError('Explicit tenant and project identifiers required')
    return hashlib.sha256((tenant + '\0' + project).encode()).hexdigest()[:24]


def validate_registry(document: dict) -> list[dict]:
    if not isinstance(document, dict) or set(document) != {'version', 'environment', 'workers'} or \
            document['version'] != 1 or document['environment'] != 'test' or \
            not isinstance(document['workers'], list) or \
            not 1 <= len(document['workers']) <= MAX_WORKERS:
        raise ValueError('Invalid pilot worker registry')
    workers = document['workers']
    identities, roles, journals, units, recorders, relayers = (set() for _ in range(6))
    for worker in workers:
        if not isinstance(worker, dict) or set(worker) != {
                'tenant', 'project', 'role', 'unit', 'journal', 'state',
                'recorder', 'relayer'}:
            raise ValueError('Invalid pilot worker entry')
        tenant, project = worker['tenant'], worker['project']
        if not all(isinstance(worker[name], str) for name in worker):
            raise ValueError('Invalid pilot worker entry types')
        instance = instance_for(tenant, project)
        role = worker['role']
        legacy = role == 'worker'
        unit = (LEGACY_UNIT if legacy else
                f'aichain-governance-project-worker@{instance}.service')
        journal = (LEGACY_JOURNAL if legacy else
                   f'/var/lib/aichain-governance-workers/{instance}/worker.sqlite')
        if role != ('worker' if legacy else f'worker_{instance}') or \
                worker['unit'] != unit or worker['journal'] != journal or \
                worker['state'] not in ('active', 'paused') or \
                not ADDRESS.fullmatch(worker['recorder']) or \
                not ADDRESS.fullmatch(worker['relayer']) or \
                int(worker['recorder'][2:], 16) == 0 or \
                int(worker['relayer'][2:], 16) == 0:
            raise ValueError('Pilot worker binding mismatch')
        for value, seen in (((tenant, project), identities), (role, roles),
                            (journal, journals), (unit, units),
                            (worker['recorder'].lower(), recorders),
                            (worker['relayer'].lower(), relayers)):
            if value in seen:
                raise ValueError('Duplicate pilot worker binding')
            seen.add(value)
    return workers


def load_registry(path: Path = REGISTRY) -> list[dict]:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_size > 32768 or \
            (os.name != 'nt' and (info.st_uid != 0 or info.st_mode & 0o077)):
        raise ValueError('Protected pilot worker registry required')
    return validate_registry(json.loads(path.read_text(encoding='utf-8')))


def verify_journal_binding(worker: dict) -> None:
    journal = Path(worker['journal'])
    info = journal.lstat()
    if not stat.S_ISREG(info.st_mode) or (os.name != 'nt' and info.st_mode & 0o077):
        raise ValueError('Private registered worker journal required')
    with closing(sqlite3.connect('file:' + str(journal) + '?mode=ro', uri=True,
                                 timeout=3)) as db:
        if db.execute('SELECT name FROM governance_environment').fetchone() != ('test',):
            raise ValueError('Worker journal environment mismatch')
        row = db.execute('SELECT body FROM config WHERE id=1').fetchone()
    if not row or not isinstance(row[0], str) or len(row[0]) > 4096:
        raise ValueError('Worker journal identity missing')
    identity = json.loads(row[0])
    if not isinstance(identity, dict) or identity.get('scope') != {'tenant': worker['tenant'],
                                 'project': worker['project']} or \
            not isinstance(identity.get('publisher'), str) or \
            not isinstance(identity.get('recorder'), str) or \
            identity['publisher'].lower() != worker['relayer'].lower() or \
            identity['recorder'].lower() != worker['recorder'].lower() or \
            not isinstance(identity.get('contract'), str) or \
            identity['contract'].lower() != CONTRACT or \
            identity.get('chain') != 84532:
        raise ValueError('Worker journal identity differs from registry')
