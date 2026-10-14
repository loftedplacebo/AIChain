"""Closed Production publisher inventory for coordinated backup and recovery."""

import hashlib
import json
import os
import re
import sqlite3
import stat
from contextlib import closing
from pathlib import Path


REGISTRY = Path('/etc/aichain/production/workers.json')
LOCK = Path('/etc/aichain/production/workers.lock')
STATE = Path('/var/lib/orvessian-production-workers')
UUID = r'[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}'
TENANT = re.compile(r'^org-' + UUID + r'$')
PROJECT = re.compile(r'^prj-' + UUID + r'$')
ADDRESS = re.compile(r'^0x[a-fA-F0-9]{40}$')
HASH = re.compile(r'^0x[a-fA-F0-9]{64}$')
MAX_WORKERS = 30


def instance_for(tenant, project):
    if not isinstance(tenant, str) or not isinstance(project, str) or \
            not TENANT.fullmatch(tenant) or not PROJECT.fullmatch(project):
        raise ValueError('Exact Production workspace and project IDs required')
    return hashlib.sha256((tenant + '\0' + project).encode()).hexdigest()[:24]


def chain_binding(chain):
    if chain is None:
        return None
    if not isinstance(chain, dict) or set(chain) != {'chainId', 'contract', 'codeHash'} or \
            not isinstance(chain['chainId'], int) or isinstance(chain['chainId'], bool) or \
            chain['chainId'] != 8453 or \
            not isinstance(chain['contract'], str) or \
            not ADDRESS.fullmatch(chain['contract']) or \
            int(chain['contract'][2:], 16) == 0 or \
            not isinstance(chain['codeHash'], str) or not HASH.fullmatch(chain['codeHash']) or \
            int(chain['codeHash'][2:], 16) == 0:
        raise ValueError('Reviewed Production chain binding required')
    return chain


def validate_registry(document):
    if not isinstance(document, dict) or set(document) != {
            'version', 'environment', 'chain', 'workers'} or \
            document['version'] != 1 or document['environment'] != 'prod' or \
            not isinstance(document['workers'], list) or \
            len(document['workers']) > MAX_WORKERS:
        raise ValueError('Invalid Production worker registry')
    chain = chain_binding(document['chain'])
    workers = document['workers']
    if workers and chain is None:
        raise ValueError('Production workers require a reviewed chain binding')
    identities, roles, journals, units, recorders, relayers = (set() for _ in range(6))
    for worker in workers:
        if not isinstance(worker, dict) or set(worker) != {
                'tenant', 'project', 'role', 'unit', 'journal', 'state',
                'recorder', 'relayer'} or \
                not all(isinstance(value, str) for value in worker.values()):
            raise ValueError('Invalid Production worker entry')
        tenant, project = worker['tenant'], worker['project']
        instance = instance_for(tenant, project)
        if worker['role'] != 'worker_' + instance or \
                worker['unit'] != f'orvessian-production-project-worker@{instance}.service' or \
                worker['journal'] != str(STATE / instance / 'worker.sqlite') or \
                worker['state'] not in ('active', 'paused') or \
                not ADDRESS.fullmatch(worker['recorder']) or \
                not ADDRESS.fullmatch(worker['relayer']) or \
                int(worker['recorder'][2:], 16) == 0 or \
                int(worker['relayer'][2:], 16) == 0 or \
                worker['recorder'].lower() == worker['relayer'].lower():
            raise ValueError('Production worker binding mismatch')
        for value, seen in (((tenant, project), identities),
                            (worker['role'], roles),
                            (worker['journal'], journals),
                            (worker['unit'], units),
                            (worker['recorder'].lower(), recorders),
                            (worker['relayer'].lower(), relayers)):
            if value in seen:
                raise ValueError('Duplicate Production worker binding')
            seen.add(value)
    return workers


def load_registry(path=REGISTRY):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or not 1 <= info.st_size <= 32768 or \
            (os.name != 'nt' and (info.st_uid != 0 or
             stat.S_IMODE(info.st_mode) != 0o600)):
        raise ValueError('Protected Production worker registry required')
    document = json.loads(path.read_text(encoding='utf-8'))
    return document, validate_registry(document)


def verify_catalog(workers, catalog):
    if not isinstance(catalog, list) or not all(isinstance(row, dict) and
            set(row) == {'tenant', 'project'} for row in catalog):
        raise ValueError('Complete Production project catalog required')
    expected = {(worker['tenant'], worker['project']) for worker in workers}
    actual = {(row['tenant'], row['project']) for row in catalog}
    if len(actual) != len(catalog) or actual != expected:
        raise ValueError('Production project/worker coverage mismatch')


def verify_journal_binding(worker, chain, *, journal_path=None,
                           require_review_gate=False):
    chain_binding(chain)
    if chain is None:
        raise ValueError('Production journal requires a chain binding')
    journal = Path(journal_path) if journal_path is not None else Path(worker['journal'])
    info = journal.lstat()
    if not stat.S_ISREG(info.st_mode) or (os.name != 'nt' and info.st_mode & 0o077):
        raise ValueError('Private Production worker journal required')
    with closing(sqlite3.connect('file:' + str(journal) + '?mode=ro',
                                 uri=True, timeout=3)) as db:
        if db.execute('PRAGMA quick_check').fetchone() != ('ok',) or \
                db.execute('SELECT name FROM governance_environment').fetchone() != ('prod',):
            raise ValueError('Production journal integrity or environment mismatch')
        row = db.execute('SELECT body FROM config WHERE id=1').fetchone()
        if require_review_gate:
            present = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' "
                                 "AND name='governance_recovery_gate'").fetchone()
            if present != (1,):
                raise ValueError('Restored Production journal must remain closed')
            gate = db.execute('SELECT state FROM governance_recovery_gate').fetchall()
            if gate != [('review-required',)]:
                raise ValueError('Restored Production journal must remain closed')
    if not row or not isinstance(row[0], str) or len(row[0]) > 4096:
        raise ValueError('Production journal identity missing')
    identity = json.loads(row[0])
    if not isinstance(identity, dict) or \
            identity.get('scope') != {'tenant': worker['tenant'],
                                      'project': worker['project']} or \
            not isinstance(identity.get('publisher'), str) or \
            not isinstance(identity.get('recorder'), str) or \
            not isinstance(identity.get('contract'), str) or \
            identity['publisher'].lower() != worker['relayer'].lower() or \
            identity['recorder'].lower() != worker['recorder'].lower() or \
            identity['contract'].lower() != chain['contract'].lower() or \
            identity.get('chain') != chain['chainId']:
        raise ValueError('Production journal identity differs from registry')
