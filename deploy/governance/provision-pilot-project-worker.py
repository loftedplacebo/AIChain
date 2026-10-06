#!/usr/bin/env python3
"""Idempotently prepare a paused, isolated project worker on the pilot VPS.

This creates no testnet transaction and never enables the unit. An operator
reviews the new signer, relayer funding and bounded policy before activation.
"""

import json
import os
import pathlib
import re
import secrets
import sqlite3
from contextlib import closing
from urllib.parse import urlsplit
import stat
import subprocess
import sys
import tempfile
from pilot_worker_registry import (REGISTRY, LOCK, MAX_WORKERS, instance_for,
                                   load_registry, validate_registry,
                                   verify_journal_binding)

ROOT = pathlib.Path('/etc/aichain/governance-workers')
STATE = pathlib.Path('/var/lib/aichain-governance-workers')
RUNTIME = pathlib.Path('/opt/aichain/governance-pilot-worker')
NODE = '/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node'
TEMPLATE = pathlib.Path('/etc/systemd/system/aichain-governance-project-worker@.service')
SOURCE_TEMPLATE = RUNTIME / 'deploy/systemd/aichain-governance-project-worker@.service'
KEY_SCRIPT = """const fs=require('node:fs'),{Wallet}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
const files=process.argv.slice(1);console.log(JSON.stringify(files.map(f=>new Wallet(fs.readFileSync(f,'utf8').trim()).address)));"""
BALANCE_SCRIPT = """const {JsonRpcProvider}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
(async()=>{const p=new JsonRpcProvider(process.argv[1]);try{const n=await p.getNetwork();if(n.chainId!==84532n)throw Error('Wrong Base Sepolia chain');console.log(String(await p.getBalance(process.argv[2])));}finally{p.destroy();}})().catch(()=>process.exit(1));"""
POLICY_KEYS = {'batchSize', 'maxTransactionsPerHour', 'maxGasPriceWei',
               'dailyReservationWei', 'l1AllowanceWei'}


def protected_file(path: pathlib.Path, maximum: int) -> str:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077 or \
            not 1 <= info.st_size <= maximum:
        raise ValueError('Protected root-owned input required')
    return path.read_text(encoding='utf-8').rstrip('\n')


def request_plan(request: dict) -> dict:
    if not isinstance(request, dict) or set(request) != {
            'tenant', 'project', 'databaseUrlFile', 'databaseCaFile', 'rpcUrl',
            'workerPolicy', 'fundingTargetWei', 'reviewId'}:
        raise ValueError('Exact project worker request required')
    if not all(isinstance(request[name], str) for name in
               ('tenant', 'project', 'reviewId', 'rpcUrl')):
        raise ValueError('Explicit project and review identifiers required')
    instance = instance_for(request['tenant'], request['project'])
    if not re.fullmatch(r'[A-Za-z0-9._-]{4,80}', request['reviewId']) or \
            not re.fullmatch(r'https://[A-Za-z0-9.-]+(?:/[A-Za-z0-9/_-]*)?',
                             request['rpcUrl']) or \
            request['rpcUrl'] != 'https://sepolia.base.org' or \
            not isinstance(request['workerPolicy'], dict) or \
            set(request['workerPolicy']) != POLICY_KEYS or \
            not all(isinstance(request['workerPolicy'][key], int) and
                    not isinstance(request['workerPolicy'][key], bool) and
                    1 <= request['workerPolicy'][key] <= (1000 if key == 'batchSize' else 100)
                    for key in ('batchSize', 'maxTransactionsPerHour')) or \
            not all(re.fullmatch(r'[1-9][0-9]{0,29}',
                                 str(request['workerPolicy'][key]))
                    for key in ('maxGasPriceWei', 'dailyReservationWei',
                                'l1AllowanceWei')) or \
            not re.fullmatch(r'[1-9][0-9]{0,29}', str(request['fundingTargetWei'])):
        raise ValueError('Reviewed Base Sepolia funding and worker policy required')
    if int(request['fundingTargetWei']) < int(request['workerPolicy']['dailyReservationWei']):
        raise ValueError('Funding target must cover the daily reservation')
    for name in ('databaseUrlFile', 'databaseCaFile'):
        if not isinstance(request[name], str) or not pathlib.Path(request[name]).is_absolute():
            raise ValueError('Absolute protected database input required')
    return {'instance': instance, 'role': 'worker_' + instance,
            'unit': f'aichain-governance-project-worker@{instance}.service',
            'journal': str(STATE / instance / 'worker.sqlite')}


def atomic_json(path: pathlib.Path, value: dict) -> None:
    fd, temporary = tempfile.mkstemp(prefix='.pilot-workers-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            json.dump(value, handle, sort_keys=True)
            handle.write('\n')
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def atomic_env(path: pathlib.Path, value: str, group: int) -> None:
    fd, temporary = tempfile.mkstemp(prefix='.pilot-worker-env-', dir=path.parent)
    try:
        os.fchmod(fd, 0o640)
        os.fchown(fd, 0, group)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(value)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def key_address(path: pathlib.Path, owner: int, group: int) -> str:
    if not path.exists():
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            os.fchown(fd, owner, group)
            os.write(fd, ('0x' + secrets.token_hex(32) + '\n').encode())
            os.fsync(fd)
        finally:
            os.close(fd)
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != owner or info.st_gid != group or \
            stat.S_IMODE(info.st_mode) != 0o600 or info.st_size != 67:
        raise ValueError('Protected project key required')
    result = subprocess.run((NODE, '-e', KEY_SCRIPT, str(path)), check=True,
                            capture_output=True, text=True, timeout=10)
    return json.loads(result.stdout)[0]


def main() -> None:
    if os.geteuid() != 0 or (len(sys.argv) != 2 and
                             (len(sys.argv) != 3 or sys.argv[1] != '--activate')):
        raise SystemExit('Usage: sudo provision-pilot-project-worker.py [--activate] protected-request.json')
    import pwd
    import grp
    import fcntl
    lock_fd = os.open(LOCK,
                      os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    lock_info = os.fstat(lock_fd)
    if lock_info.st_uid != 0 or lock_info.st_mode & 0o077:
        raise ValueError('Protected provisioning lock required')
    fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    activate = len(sys.argv) == 3
    request = json.loads(protected_file(pathlib.Path(sys.argv[-1]), 8192))
    plan = request_plan(request)
    workers = load_registry()
    existing = next((worker for worker in workers if worker['tenant'] == request['tenant']
                     and worker['project'] == request['project']), None)
    if existing and existing['role'] != plan['role'] or not existing and len(workers) >= MAX_WORKERS:
        raise ValueError('Project worker registry conflict or capacity reached')
    database_url = protected_file(pathlib.Path(request['databaseUrlFile']), 8192)
    ca_file = pathlib.Path(request['databaseCaFile'])
    parsed = urlsplit(database_url)
    if not ca_file.is_file() or any(char.isspace() for char in database_url) or \
            "'" in database_url or parsed.scheme != 'postgresql' or \
            not parsed.username or not parsed.password or \
            parsed.path != '/governance_test' or \
            parsed.hostname != 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com' or \
            parsed.port != 25060 or parsed.query != 'sslmode=verify-full' or parsed.fragment:
        raise ValueError('Verified protected PostgreSQL connection required')
    if not (RUNTIME / 'scripts/governance-worker.cjs').is_file() or \
            not (RUNTIME / 'node_modules/ethers').is_dir() or \
            not SOURCE_TEMPLATE.is_file():
        raise ValueError('Installed project worker runtime required')
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    STATE.mkdir(mode=0o711, parents=True, exist_ok=True)
    for path, mode in ((ROOT, 0o700), (STATE, 0o711)):
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid != 0 or \
                stat.S_IMODE(info.st_mode) != mode:
            raise ValueError('Protected worker directory root required')
    if not TEMPLATE.exists():
        TEMPLATE.write_bytes(SOURCE_TEMPLATE.read_bytes())
        TEMPLATE.chmod(0o644)
    elif TEMPLATE.read_bytes() != SOURCE_TEMPLATE.read_bytes():
        raise ValueError('Installed worker unit template differs from reviewed source')
    subprocess.run(('systemctl', 'daemon-reload'), check=True, timeout=15)
    subprocess.run(('systemd-analyze', 'verify', str(TEMPLATE)), check=True,
                   timeout=15, stdout=subprocess.DEVNULL)
    username = 'ov_' + plan['instance']
    try:
        identity = pwd.getpwnam(username)
    except KeyError:
        subprocess.run(('useradd', '--system', '--user-group', '--home', str(STATE / plan['instance']),
                        '--shell', '/usr/sbin/nologin', username), check=True, timeout=15)
        identity = pwd.getpwnam(username)
    if grp.getgrgid(identity.pw_gid).gr_name != username:
        raise ValueError('Dedicated project worker user/group required')
    directory = STATE / plan['instance']
    keys = directory / 'keys'
    for path in (directory, keys):
        path.mkdir(mode=0o700, exist_ok=True)
        info = path.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
            raise ValueError('Private worker state directory required')
        os.chown(path, identity.pw_uid, identity.pw_gid)
    recorder = key_address(keys / 'recording-service.key', identity.pw_uid,
                           identity.pw_gid)
    relayer = key_address(keys / 'relayer.key', identity.pw_uid,
                          identity.pw_gid)
    policy = json.dumps(request['workerPolicy'], separators=(',', ':'), sort_keys=True)
    enabled = 'true' if existing and existing['state'] == 'active' else 'false'
    env = (f'GOVERNANCE_ENV=test\nGOVERNANCE_STORAGE=postgres\n'
           f'GOVERNANCE_DATABASE_URL={database_url}\n'
           f'GOVERNANCE_DATABASE_CA_FILE={ca_file}\n'
           f'GOVERNANCE_TENANT={request["tenant"]}\n'
           f'GOVERNANCE_PROJECT={request["project"]}\n'
           f'GOVERNANCE_WORKER_JOURNAL={plan["journal"]}\n'
           f'GOVERNANCE_RECEIPT_KEY_FILE={keys / "recording-service.key"}\n'
           f'GOVERNANCE_RELAYER_KEY_FILE={keys / "relayer.key"}\n'
           f'GOVERNANCE_EVIDENCE_RPC_URL={request["rpcUrl"]}\n'
           f"GOVERNANCE_WORKER_POLICY='{policy}'\n"
           f'GOVERNANCE_WORKER_ENABLED={enabled}\n')
    env_file = ROOT / (plan['instance'] + '.env')
    if env_file.exists():
        info = env_file.lstat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
                info.st_gid != identity.pw_gid or stat.S_IMODE(info.st_mode) != 0o640 or \
                env_file.read_text(encoding='utf-8') != env:
            raise ValueError('Existing project worker environment differs')
    else:
        fd = os.open(env_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o640)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            os.fchown(handle.fileno(), 0, identity.pw_gid)
            handle.write(env)
            handle.flush()
            os.fsync(handle.fileno())
    journal = pathlib.Path(plan['journal'])
    if existing and existing['state'] == 'active' and not journal.is_file():
        raise ValueError('Active project worker journal missing')
    if not existing or existing['state'] != 'active':
        subprocess.run(('systemd-run', '--quiet', '--wait', '--collect', '--pipe',
                        '-p', f'User={username}', '-p', f'Group={username}',
                        '-p', f'WorkingDirectory={RUNTIME}',
                        '-p', f'EnvironmentFile={env_file}', '-p', 'UMask=0077', NODE,
                        'scripts/governance-worker.cjs', '--once'),
                       check=True, timeout=60, stdout=subprocess.DEVNULL)
    info = journal.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != identity.pw_uid or \
            info.st_mode & 0o077:
        raise ValueError('Private project worker journal required')
    with closing(sqlite3.connect('file:' + str(journal) + '?mode=ro', uri=True)) as db:
        if db.execute('SELECT name FROM governance_environment').fetchone() != ('test',):
            raise ValueError('Project worker journal environment mismatch')
    entry = {'tenant': request['tenant'], 'project': request['project'],
             'role': plan['role'], 'unit': plan['unit'],
             'journal': plan['journal'], 'state': existing['state'] if existing else 'paused',
             'recorder': recorder, 'relayer': relayer}
    verify_journal_binding(entry)
    if existing:
        if existing != entry:
            raise ValueError('Existing project worker registry binding differs')
        status = 'already-provisioned'
    else:
        document = {'version': 1, 'environment': 'test', 'workers': workers + [entry]}
        validate_registry(document)
        atomic_json(REGISTRY, document)
        status = 'provisioned-paused'
    if activate and entry['state'] != 'active':
        balance = subprocess.run((NODE, '-e', BALANCE_SCRIPT, request['rpcUrl'],
                                  relayer), check=True, capture_output=True,
                                 text=True, timeout=25)
        if int(balance.stdout.strip()) < int(request['fundingTargetWei']):
            raise ValueError('Reviewed relayer funding target not met')
        active_env = env.replace('GOVERNANCE_WORKER_ENABLED=false\n',
                                 'GOVERNANCE_WORKER_ENABLED=true\n')
        atomic_env(env_file, active_env, identity.pw_gid)
        try:
            subprocess.run(('systemctl', 'enable', '--now', plan['unit']),
                           check=True, timeout=45, stdout=subprocess.DEVNULL)
            subprocess.run(('systemctl', 'is-active', '--quiet', plan['unit']),
                           check=True, timeout=15)
            updated = [({**worker, 'state': 'active'} if worker['role'] == plan['role']
                        else worker) for worker in load_registry()]
            document = {'version': 1, 'environment': 'test', 'workers': updated}
            validate_registry(document)
            atomic_json(REGISTRY, document)
        except (OSError, ValueError, subprocess.CalledProcessError,
                subprocess.TimeoutExpired):
            subprocess.run(('systemctl', 'disable', '--now', plan['unit']),
                           check=False, timeout=45, stdout=subprocess.DEVNULL)
            atomic_env(env_file, env, identity.pw_gid)
            raise
        status = 'activated'
    elif activate:
        subprocess.run(('systemctl', 'is-active', '--quiet', plan['unit']),
                       check=True, timeout=15)
        status = 'already-active'
    print(json.dumps({'status': status, 'role': plan['role'], 'unit': plan['unit'],
                      'recorder': recorder, 'relayer': relayer,
                      'fundingTargetWei': str(request['fundingTargetWei']),
                      'reviewId': request['reviewId'],
                      'activation': 'operator-review-required'}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, json.JSONDecodeError):
        print('Project worker provisioning failed; inspect protected inputs and state. No key printed.',
              file=sys.stderr)
        raise SystemExit(1) from None
