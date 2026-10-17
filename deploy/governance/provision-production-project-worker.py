#!/usr/bin/env python3
"""Prepare one paused, isolated Production worker for an existing project.

This never reads the owner wallet, transfers ETH, enables a unit or publishes
evidence. Use only during a supervised project and backup handoff window.
"""

import fcntl
import hashlib
import importlib.util
import json
import os
import pathlib
import pwd
import grp
import re
import secrets
import sqlite3
import stat
import subprocess
import sys
import tempfile
from contextlib import closing
from urllib.parse import urlsplit

from production_worker_registry import (LOCK, REGISTRY, STATE, instance_for,
                                        load_registry, validate_registry,
                                        verify_journal_binding)


ROOT = pathlib.Path('/etc/aichain/production-worker-env')
RUNTIME = pathlib.Path('/opt/aichain/orvessian-production-worker')
TEMPLATE = pathlib.Path('/etc/systemd/system/orvessian-production-project-worker@.service')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
CA = pathlib.Path('/etc/aichain/governance/digitalocean-ca.crt')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
OWNER = '0xec502b5f4D1925138a7409D9a7b55Fba20e13cc3'
RPC = 'https://mainnet.base.org'
POLICY_KEYS = {'batchSize', 'maxTransactionsPerHour', 'maxGasPriceWei',
               'dailyReservationWei', 'l1AllowanceWei'}
UNIT_SHA256 = 'b55aff6ce94a7f652f719f60afe6695282e70af9d900b8afbe2f053714b5e889'
RELEASE_ID = {'sourceCommit': 'ba47cb8140c7ea7ecb12e57bd52c52007f6a43d2',
              'archiveSha256': '382b1987af4e15300ae40b7078f26086d5901b4f5e4b2a4edfa081b3eaf8635f',
              'serviceTemplate': TEMPLATE.name, 'activation': 'disabled'}
ORDER = int('FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141', 16)
ADDRESS_SCRIPT = ("const fs=require('node:fs');const {Wallet}=require('ethers');"
                  "console.log(new Wallet(fs.readFileSync(process.argv[1],'ascii').trim()).address)")


def protected(path, maximum):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600 or not 1 <= info.st_size <= maximum:
        raise ValueError('Protected root-owned request or database input required')
    value = path.read_text(encoding='utf-8').rstrip('\n')
    if '\n' in value or '\r' in value:
        raise ValueError('Single-line protected input required')
    return value


def request_plan(request):
    if not isinstance(request, dict) or set(request) != {
            'tenant', 'project', 'databaseUrlFile', 'rpcUrl', 'workerPolicy',
            'fundingTargetWei', 'reviewId'}:
        raise ValueError('Exact Production worker request required')
    instance = instance_for(request['tenant'], request['project'])
    if request['rpcUrl'] != RPC or not isinstance(request['reviewId'], str) or \
            not re.fullmatch(r'[A-Za-z0-9._-]{4,80}', request['reviewId']):
        raise ValueError('Reviewed Base mainnet request required')
    policy = request['workerPolicy']
    if not isinstance(policy, dict) or set(policy) != POLICY_KEYS or \
            any(isinstance(v, bool) for v in policy.values()) or \
            not isinstance(policy['batchSize'], int) or \
            not 1 <= policy['batchSize'] <= 1000 or \
            not isinstance(policy['maxTransactionsPerHour'], int) or \
            not 1 <= policy['maxTransactionsPerHour'] <= 10:
        raise ValueError('Bounded Production worker policy required')
    for key in ('maxGasPriceWei', 'dailyReservationWei', 'l1AllowanceWei'):
        if not isinstance(policy[key], str) or not re.fullmatch(r'[1-9][0-9]{0,29}', policy[key]):
            raise ValueError('Exact Production spending policy required')
    if int(policy['maxGasPriceWei']) > 1_000_000_000 or \
            int(policy['dailyReservationWei']) > 200_000_000_000_000 or \
            int(policy['l1AllowanceWei']) > 20_000_000_000_000 or \
            not isinstance(request['fundingTargetWei'], str) or \
            not re.fullmatch(r'[1-9][0-9]{0,29}', request['fundingTargetWei']) or \
            not int(policy['dailyReservationWei']) <= int(request['fundingTargetWei']) <= 200_000_000_000_000:
        raise ValueError('Production funding target exceeds reviewed per-project cap')
    if not isinstance(request['databaseUrlFile'], str) or \
            not pathlib.Path(request['databaseUrlFile']).is_absolute():
        raise ValueError('Absolute protected worker database input required')
    return {'instance': instance, 'role': 'worker_' + instance,
            'unit': f'orvessian-production-project-worker@{instance}.service',
            'journal': str(STATE / instance / 'worker.sqlite')}


def verify_database_url(value):
    parsed = urlsplit(value)
    if parsed.scheme != 'postgresql' or parsed.hostname != HOST or \
            parsed.port != 25060 or parsed.path != '/governance_prod' or \
            parsed.username != 'governance_prod_worker' or not parsed.password or \
            parsed.query != 'sslmode=verify-full' or parsed.fragment or \
            any(char.isspace() or char in "'\"`$" for char in value):
        raise ValueError('Exclusive verified-TLS Production worker database required')


def verify_catalog(catalog, workers, request):
    if not isinstance(catalog, list) or not all(isinstance(row, dict) and
            set(row) == {'tenant', 'project'} for row in catalog):
        raise ValueError('Complete Production project catalog required')
    actual = {(row['tenant'], row['project']) for row in catalog}
    registered = {(row['tenant'], row['project']) for row in workers}
    target = (request['tenant'], request['project'])
    if len(actual) != len(catalog) or actual != registered | {target}:
        raise ValueError('Production project/worker coverage mismatch')


def inactive_unit(unit):
    result = subprocess.run(('systemctl', 'show', unit, '-p', 'UnitFileState',
                             '-p', 'ActiveState'), capture_output=True, text=True,
                            timeout=15, check=False)
    if result.returncode or set(result.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production worker unit must remain inactive and disabled')


def private_directory(path, owner, group, mode):
    path.mkdir(mode=mode, parents=False, exist_ok=True)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != mode or \
            info.st_uid not in (0, owner) or info.st_gid not in (0, group):
        raise ValueError('Private Production worker directory required')
    os.chown(path, owner, group)


def address_for(path, uid, gid):
    if not path.exists() and not path.is_symlink():
        secret = '0x' + format(secrets.randbelow(ORDER - 1) + 1, '064x') + '\n'
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, 'w', encoding='ascii') as handle:
            os.fchown(handle.fileno(), uid, gid)
            handle.write(secret)
            handle.flush()
            os.fsync(handle.fileno())
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or info.st_gid != gid or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 67:
        raise ValueError('Worker-owned private signer key required')
    result = subprocess.run((NODE, '-e', ADDRESS_SCRIPT, str(path)), cwd=RUNTIME,
                            capture_output=True, text=True, timeout=10, check=False)
    if result.returncode or not re.fullmatch(r'0x[0-9a-fA-F]{40}\n', result.stdout):
        raise ValueError('Worker signer address verification failed')
    return result.stdout.strip()


def atomic_json(path, value):
    descriptor, temporary = tempfile.mkstemp(prefix='.prod-workers-', dir=path.parent)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, sort_keys=True)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def prepare_journal(path, uid, gid, request, chain, recorder, relayer):
    if path.exists() or path.is_symlink():
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != uid or \
                info.st_gid != gid or stat.S_IMODE(info.st_mode) != 0o600:
            raise ValueError('Existing Production journal ownership differs')
        return
    old_umask = os.umask(0o077)
    try:
        with closing(sqlite3.connect(path)) as db:
            db.execute('CREATE TABLE governance_environment(name TEXT NOT NULL)')
            db.execute("INSERT INTO governance_environment VALUES('prod')")
            db.execute('CREATE TABLE config(id INTEGER PRIMARY KEY,body TEXT NOT NULL)')
            identity = {'scope': {'tenant': request['tenant'], 'project': request['project']},
                        'publisher': relayer.lower(), 'contract': chain['contract'].lower(),
                        'chain': 8453, 'recorder': recorder.lower()}
            db.execute('INSERT INTO config VALUES(1,?)',
                       (json.dumps(identity, separators=(',', ':')),))
            db.commit()
        os.chown(path, uid, gid)
    finally:
        os.umask(old_umask)


def main():
    apply = len(sys.argv) == 3 and sys.argv[1] == '--apply'
    if os.geteuid() != 0 or not (len(sys.argv) == 2 or apply):
        raise ValueError('Usage: provision-production-project-worker.py [--apply] protected-request.json')
    request = json.loads(protected(pathlib.Path(sys.argv[-1]), 8192))
    plan = request_plan(request)
    lock = os.open(LOCK, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        lock_info = os.fstat(lock)
        if not stat.S_ISREG(lock_info.st_mode) or lock_info.st_uid != 0 or \
                stat.S_IMODE(lock_info.st_mode) != 0o600:
            raise ValueError('Protected Production provisioning lock required')
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        document, workers = load_registry()
        if document['chain'] is None or len(workers) >= 10 and not any(
                w['role'] == plan['role'] for w in workers):
            raise ValueError('Production chain or first-cohort capacity unavailable')
        existing = next((w for w in workers if w['role'] == plan['role']), None)
        if existing and existing['state'] != 'paused':
            raise ValueError('Active Production worker cannot be reprovisioned')
        source = pathlib.Path(__file__).with_name('apply-production-schema.py')
        spec = importlib.util.spec_from_file_location('production_schema', source)
        schema = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(schema)
        admin = schema.protected(schema.ADMIN, 1025)
        sql = ("SELECT COALESCE(json_agg(json_build_object('tenant',workspace,"
               "'project',id))::text,'[]') FROM governance_customer_projects;")
        if schema.psql('doadmin', admin, 'SELECT name FROM governance_environment;') != 'prod':
            raise ValueError('Production database marker required')
        verify_catalog(json.loads(schema.psql('doadmin', admin, sql)),
                       workers, request)
        url = protected(pathlib.Path(request['databaseUrlFile']), 8192)
        verify_database_url(url)
        unit_info = TEMPLATE.lstat()
        release = RUNTIME / 'PRODUCTION-WORKER-RELEASE.json'
        if not CA.is_file() or CA.is_symlink() or \
                not stat.S_ISREG(unit_info.st_mode) or unit_info.st_uid != 0 or \
                unit_info.st_mode & 0o022 or \
                hashlib.sha256(TEMPLATE.read_bytes()).hexdigest() != UNIT_SHA256 or \
                json.loads(release.read_text(encoding='ascii')) != RELEASE_ID or \
                not (RUNTIME / 'scripts/governance-production-worker.cjs').is_file():
            raise ValueError('Reviewed Production worker runtime required')
        inactive_unit(plan['unit'])
        if not apply:
            print('production_project_worker=ready;role=' + plan['role'] +
                  ';service=off;funding=not_sent')
            return
        username = 'ovp_' + plan['instance']
        try:
            identity = pwd.getpwnam(username)
        except KeyError:
            subprocess.run(('useradd', '--system', '--user-group', '--home',
                            str(STATE / plan['instance']), '--shell',
                            '/usr/sbin/nologin', username), check=True, timeout=15)
            identity = pwd.getpwnam(username)
        if grp.getgrgid(identity.pw_gid).gr_name != username:
            raise ValueError('Dedicated Production worker user/group required')
        ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
        STATE.mkdir(mode=0o711, parents=True, exist_ok=True)
        for root, mode in ((ROOT, 0o700), (STATE, 0o711)):
            info = root.lstat()
            if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or \
                    stat.S_IMODE(info.st_mode) != mode:
                raise ValueError('Protected Production worker root required')
        home = STATE / plan['instance']
        private_directory(home, identity.pw_uid, identity.pw_gid, 0o700)
        keys = home / 'keys'
        private_directory(keys, identity.pw_uid, identity.pw_gid, 0o700)
        recorder = address_for(keys / 'recording-service.key', identity.pw_uid,
                               identity.pw_gid)
        relayer = address_for(keys / 'relayer.key', identity.pw_uid,
                              identity.pw_gid)
        if len({recorder.lower(), relayer.lower(), OWNER.lower()}) != 3:
            raise ValueError('Owner, recorder and relayer must remain separate')
        policy = json.dumps(request['workerPolicy'], sort_keys=True, separators=(',', ':'))
        anchor = {'chainId': document['chain']['chainId'],
                  'contract': document['chain']['contract'],
                  'codeHash': document['chain']['codeHash']}
        env = (f'GOVERNANCE_ENV=prod\nGOVERNANCE_PRODUCTION_HOST=contabo-shared\n'
               f'GOVERNANCE_STORAGE=postgres\nGOVERNANCE_WORKER_ENABLED=false\n'
               f'GOVERNANCE_TENANT={request["tenant"]}\nGOVERNANCE_PROJECT={request["project"]}\n'
               f'GOVERNANCE_DATABASE_URL={url}\nGOVERNANCE_DATABASE_CA_FILE={CA}\n'
               f'GOVERNANCE_WORKER_JOURNAL={plan["journal"]}\n'
               f'GOVERNANCE_RECEIPT_KEY_FILE={keys / "recording-service.key"}\n'
               f'GOVERNANCE_RELAYER_KEY_FILE={keys / "relayer.key"}\n'
               f'GOVERNANCE_EXPECTED_RECORDER={recorder}\n'
               f'GOVERNANCE_EXPECTED_RELAYER={relayer}\n'
               f'GOVERNANCE_MAINNET_RPC_URL={RPC}\n'
               f"GOVERNANCE_MAINNET_ANCHOR='{json.dumps(anchor, separators=(',', ':'))}'\n"
               f"GOVERNANCE_WORKER_POLICY='{policy}'\n")
        env_file = ROOT / (plan['instance'] + '.env')
        if env_file.exists() or env_file.is_symlink():
            info = env_file.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                    info.st_gid != identity.pw_gid or stat.S_IMODE(info.st_mode) != 0o640 or \
                    env_file.read_text(encoding='utf-8') != env:
                raise ValueError('Existing Production worker environment differs')
        else:
            descriptor = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                                 os.O_NOFOLLOW, 0o640)
            with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                os.fchown(output.fileno(), 0, identity.pw_gid)
                output.write(env)
                output.flush()
                os.fsync(output.fileno())
        journal = pathlib.Path(plan['journal'])
        prepare_journal(journal, identity.pw_uid, identity.pw_gid, request,
                        document['chain'], recorder, relayer)
        entry = {'tenant': request['tenant'], 'project': request['project'],
                 'role': plan['role'], 'unit': plan['unit'],
                 'journal': plan['journal'], 'state': 'paused',
                 'recorder': recorder, 'relayer': relayer}
        verify_journal_binding(entry, document['chain'])
        if existing:
            if entry != existing:
                raise ValueError('Existing Production worker binding differs')
            result = 'already-prepared'
        else:
            updated = {**document, 'workers': workers + [entry]}
            validate_registry(updated)
            atomic_json(REGISTRY, updated)
            result = 'prepared-paused'
        print('production_project_worker=' + result + ';role=' + plan['role'] +
              ';relayer=' + relayer + ';service=off;funding=not_sent')
    finally:
        os.close(lock)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.SubprocessError,
            BlockingIOError):
        raise SystemExit('Production worker preparation failed; no secret printed, '
                         'funding sent or service activated') from None
