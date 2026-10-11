#!/usr/bin/env python3
"""Move the synthetic pilot to local PostgreSQL 17 under a writer pause.

Preflight is read-only. Apply retains the managed source and protected rollback
settings. Failure before acceptance restores managed service settings.
"""

import fcntl
import hashlib
import json
import os
import pathlib
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.parse import quote, urlsplit

from pilot_db_binding import load_admin, psql_environment
from pilot_worker_registry import load_registry

ROOT = pathlib.Path('/var/lib/aichain-pilot-db-migration')
SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
API_SCRIPT = pathlib.Path('/opt/aichain/governance-pilot-api/scripts/governance-hosted-synthetic-api.cjs')
STAGED_API = API_SCRIPT.with_name('governance-hosted-synthetic-api.cutover.cjs')
BACKUP = SETUP / 'run-pilot-backup-once.py'
POLICY = pathlib.Path('/etc/aichain/pilot-self-service-policy.json')
BINDING = pathlib.Path('/etc/aichain/pilot-database-binding.json')
LOCAL_BINDING = SETUP / 'pilot-database-binding.local.example.json'
WORKER_URL = pathlib.Path('/etc/aichain/governance-workers/pilot-evidence-database-url')
API_ENV = pathlib.Path('/etc/aichain-governance-synthetic-api.env')
MAIN_WORKER_ENV = pathlib.Path('/etc/aichain-governance-pilot-worker.env')
PG = pathlib.Path('/usr/lib/postgresql/17/bin')
TIMERS = ('orvessian-pilot-self-service.timer', 'orvessian-pilot-identity-replay.timer',
          'orvessian-pilot-backup.timer', 'orvessian-internal-responses-canary.timer')
FIXED_SERVICES = ('orvessian-pilot-portal.service', 'aichain-governance-synthetic-api.service')
TARGET = 'governance_test'


def run(args, *, env=None, input_text=None, timeout=120):
    result = subprocess.run(args, env=env, input=input_text, text=True,
                            capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError('Command failed: ' + pathlib.Path(args[0]).name)
    return result.stdout.strip()


def admin_sql(sql):
    return run(('runuser', '-u', 'postgres', '--', str(PG / 'psql'), '-X', '-q',
                '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-p', '5433', '-d', 'postgres'),
               input_text=sql)


def source_sql(binding, sql):
    environment = psql_environment(binding)
    environment['PGOPTIONS'] = '-c TimeZone=UTC'
    return run((str(PG / 'psql'), '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1',
                '-h', binding['host'], '-p', str(binding['port']), '-U', binding['user'],
                '-d', TARGET, '-c', sql), env=environment)


def local_sql(sql, database=TARGET):
    environment = os.environ.copy()
    environment['PGOPTIONS'] = '-c TimeZone=UTC'
    return run(('runuser', '-u', 'postgres', '--', str(PG / 'psql'), '-X', '-q',
                '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-p', '5433', '-d', database,
                '-c', sql), env=environment)


def service_active(unit):
    return subprocess.run(('systemctl', 'is-active', '--quiet', unit),
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0


def protected(path, maximum=16384):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or path.is_symlink() or info.st_uid != 0 or \
            info.st_mode & 0o022 or not 1 <= info.st_size <= maximum:
        raise RuntimeError('Protected cutover input required: ' + path.name)
    return path.read_text(encoding='utf-8')


def atomic_bytes(path, data, original):
    fd, temporary = tempfile.mkstemp(prefix='.pilot-db-cutover-', dir=path.parent)
    try:
        os.fchmod(fd, stat.S_IMODE(original.st_mode))
        os.fchown(fd, original.st_uid, original.st_gid)
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def update_env(text, url):
    lines = text.splitlines(keepends=True)
    keys = {'GOVERNANCE_DATABASE_URL': url, 'GOVERNANCE_DATABASE_CA_FILE': ''}
    seen = set()
    for index, line in enumerate(lines):
        key, sep, _ = line.partition('=')
        if sep and key in keys:
            if key in seen:
                raise RuntimeError('Duplicate protected database setting')
            lines[index] = key + '=' + keys[key] + '\n'
            seen.add(key)
    if seen != set(keys):
        raise RuntimeError('Missing protected database setting')
    return ''.join(lines).encode('utf-8')


def worker_units():
    workers = load_registry()
    if len(workers) != 4 or any(worker['state'] != 'active' for worker in workers):
        raise RuntimeError('Expected four active registered pilot workers')
    return workers, tuple(worker['unit'] for worker in workers)


def preflight():
    if os.geteuid() != 0:
        raise RuntimeError('Root required')
    binding = load_admin()
    if binding['profile'] != 'managed':
        raise RuntimeError('Managed pilot source binding required')
    if admin_sql("SELECT datname FROM pg_database WHERE datname='governance_test';"):
        raise RuntimeError('Local final pilot database already exists')
    if (ROOT / 'cutover-rollback').exists():
        raise RuntimeError('Prior cutover rollback directory requires review')
    if not STAGED_API.is_file() or not LOCAL_BINDING.is_file() or not BACKUP.is_file():
        raise RuntimeError('Reviewed cutover artifacts missing')
    passwords = json.loads(protected(ROOT / 'candidate-roles.json'))
    if set(passwords) != {'governance_migrations', 'governance_api', 'governance_evidence_worker'} or \
            any(not re.fullmatch(r'[0-9a-f]{64}', value) for value in passwords.values()):
        raise RuntimeError('Protected local role credentials invalid')
    protected(ROOT / 'local-postgres-password', 128)
    workers, units = worker_units()
    files = [API_SCRIPT, API_ENV, MAIN_WORKER_ENV, WORKER_URL, POLICY, BINDING,
             *(pathlib.Path('/etc/aichain/governance-workers') / (worker['unit'].split('@')[-1].split('.')[0] + '.env')
               for worker in workers if '@' in worker['unit'])]
    if len(files) != 9 or len(set(files)) != len(files):
        raise RuntimeError('Pilot service file inventory mismatch')
    for file in files:
        protected(file, 65536)
    for file in (API_ENV, MAIN_WORKER_ENV, *files[6:]):
        if file.suffix != '.env':
            continue
        values = dict(line.split('=', 1) for line in protected(file).splitlines() if '=' in line)
        parsed = urlsplit(values.get('GOVERNANCE_DATABASE_URL', ''))
        expected = 'governance_api' if file == API_ENV else 'governance_evidence_worker'
        if parsed.hostname != binding['host'] or parsed.port != 25060 or \
                parsed.path != '/governance_test' or parsed.username != expected or \
                parsed.query != 'sslmode=verify-full':
            raise RuntimeError('Pilot service still has an unexpected database endpoint')
    policy = json.loads(protected(POLICY))
    if policy.get('databaseCaFile') != binding['caFile'] or policy.get('enabled') is not True:
        raise RuntimeError('Current self-service policy differs from managed profile')
    if not all(service_active(unit) for unit in (*FIXED_SERVICES, *units)):
        raise RuntimeError('Pilot service unavailable before cutover')
    if not all(service_active(timer) for timer in TIMERS):
        raise RuntimeError('Pilot timer unavailable before cutover')
    if service_active('orvessian-pilot-backup.service'):
        raise RuntimeError('Scheduled pilot backup is already running')
    run(('python3', str(SETUP / 'check-pilot-hosted-health.py')), timeout=60)
    run(('python3', str(SETUP / 'check-pilot-backup-health.py')), timeout=45)
    sample = 'COPY (SELECT row_to_json(t)::text FROM public.governance_migrations t ORDER BY row_to_json(t)::text) TO STDOUT'
    source_sample = source_sql(binding, sample)
    local_sample = local_sql(sample, 'governance_test_candidate')
    if source_sample != local_sample:
        source_rows = [json.loads(line) for line in source_sample.splitlines()]
        local_rows = [json.loads(line) for line in local_sample.splitlines()]
        fields = sorted({key for left, right in zip(source_rows, local_rows)
                         for key in left.keys() | right.keys() if left.get(key) != right.get(key)})
        raise RuntimeError('Candidate migration history differs from managed source '
                           f'(source bytes={len(source_sample)}, local bytes={len(local_sample)}, fields={fields})')
    acl_sql = ("SELECT grantee || '|' || table_name || '|' || privilege_type "
               "FROM information_schema.role_table_grants WHERE table_schema='public' "
               "AND grantee IN ('governance_api','governance_evidence_worker') "
               "ORDER BY 1")
    source_grants = set(source_sql(binding, acl_sql).splitlines())
    local_grants = set(local_sql(acl_sql, 'governance_test_candidate').splitlines())
    if source_grants != local_grants:
        raise RuntimeError('Candidate runtime grants differ from managed source '
                           f'(source_only={sorted(source_grants-local_grants)}, '
                           f'local_only={sorted(local_grants-source_grants)})')
    function_acl = ("SELECT p.proname || '|' || COALESCE(p.proacl::text,'') "
                    "FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace "
                    "WHERE n.nspname='public' ORDER BY p.proname")
    source_functions = set(source_sql(binding, function_acl).splitlines())
    local_functions = set(local_sql(function_acl, 'governance_test_candidate').splitlines())
    if source_functions != local_functions:
        names = sorted({line.partition('|')[0] for line in source_functions ^ local_functions})
        raise RuntimeError('Candidate function grants differ: ' + ', '.join(names[:20]))
    public_acl = ("SELECT c.relname || '|' || x.privilege_type "
                  "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
                  "CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x "
                  "WHERE n.nspname='public' AND c.relkind IN ('r','p','S','v','m') "
                  "AND x.grantee=0 ORDER BY 1")
    source_public = set(source_sql(binding, public_acl).splitlines())
    local_public = set(local_sql(public_acl, 'governance_test_candidate').splitlines())
    if not local_public.issubset(source_public):
        raise RuntimeError('Candidate has broader PUBLIC relation grants: ' +
                           ', '.join(sorted(local_public-source_public)[:20]))
    schema_acl = ("SELECT x.privilege_type FROM pg_namespace n "
                  "CROSS JOIN LATERAL aclexplode(n.nspacl) x "
                  "WHERE n.nspname='public' AND x.grantee=0 ORDER BY 1")
    source_schema = set(source_sql(binding, schema_acl).splitlines())
    local_schema = set(local_sql(schema_acl, 'governance_test_candidate').splitlines())
    if not local_schema.issubset(source_schema):
        raise RuntimeError('Candidate public schema has broader grants than managed source')
    return binding, passwords, files, units


def fingerprints(binding):
    tables = source_sql(binding, "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    if len(tables) != 31 or any(not re.fullmatch(r'[a-z][a-z0-9_]*', table) for table in tables):
        raise RuntimeError('Unexpected pilot table inventory')
    local_tables = local_sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").splitlines()
    if tables != local_tables:
        raise RuntimeError('Local table inventory differs from managed source')
    for table in tables:
        sql = f'COPY (SELECT row_to_json(t)::text FROM public.{table} t ORDER BY row_to_json(t)::text) TO STDOUT'
        source = source_sql(binding, sql)
        local = local_sql(sql)
        if hashlib.sha256(source.encode()).digest() != hashlib.sha256(local.encode()).digest():
            raise RuntimeError('Pilot row fingerprint mismatch: ' + table)
    if local_sql('SELECT name FROM governance_environment') != 'test':
        raise RuntimeError('Local environment marker mismatch')
    return len(tables)


def copy_final(binding, passwords):
    dump = ROOT / 'governance_test.final.dump'
    if dump.exists():
        raise RuntimeError('A final pilot dump already exists')
    run((str(PG / 'pg_dump'), '-Fc', '--no-owner', '--no-acl', '-h', binding['host'],
         '-p', str(binding['port']), '-U', binding['user'], '-d', TARGET, '-f', str(dump)),
        env=psql_environment(binding), timeout=300)
    os.chmod(dump, 0o600)
    admin_sql('CREATE DATABASE governance_test OWNER governance_migrations;')
    admin_sql('REVOKE ALL ON DATABASE governance_test FROM PUBLIC; '
              'GRANT CONNECT ON DATABASE governance_test TO governance_migrations, governance_api, governance_evidence_worker;')
    env = os.environ.copy()
    env.update(PGPASSWORD=passwords['governance_migrations'], PGSSLMODE='disable')
    run((str(PG / 'pg_restore'), '--exit-on-error', '--no-owner', '--no-acl',
         '-h', '127.0.0.1', '-p', '5433', '-U', 'governance_migrations',
         '-d', TARGET, str(dump)), env=env, timeout=300)
    for filename in ('postgres-api-grants.sql', 'postgres-evidence-worker-grants.sql'):
        run((str(PG / 'psql'), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
             '-p', '5433', '-U', 'governance_migrations', '-d', TARGET,
             '-f', str(SETUP / filename)), env=env)
    run((str(PG / 'psql'), '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1',
         '-p', '5433', '-U', 'governance_migrations', '-d', TARGET, '-c',
         'REVOKE ALL ON SCHEMA public FROM PUBLIC; '
         'GRANT SELECT ON public.governance_pilot_project_capacity TO governance_api; '
         'REVOKE ALL ON FUNCTION public.governance_pilot_project_limit() FROM PUBLIC'), env=env)


def replace_settings(files, passwords):
    rollback = ROOT / 'cutover-rollback'
    rollback.mkdir(mode=0o700)
    manifest = []
    for index, file in enumerate(files):
        info = file.lstat()
        backup = rollback / f'{index:02d}.snapshot'
        shutil.copyfile(file, backup)
        os.chmod(backup, 0o600)
        manifest.append({'path': str(file), 'snapshot': str(backup),
                         'mode': stat.S_IMODE(info.st_mode), 'uid': info.st_uid,
                         'gid': info.st_gid})
    marker = rollback / 'manifest.json'
    marker.write_text(json.dumps(manifest), encoding='utf-8')
    os.chmod(marker, 0o600)
    for file in files:
        info = file.lstat()
        if file == API_SCRIPT:
            data = STAGED_API.read_bytes()
        elif file == BINDING:
            data = LOCAL_BINDING.read_bytes()
        elif file == POLICY:
            policy = json.loads(file.read_text(encoding='utf-8'))
            policy['databaseCaFile'] = ''
            data = (json.dumps(policy, sort_keys=True) + '\n').encode()
        elif file == WORKER_URL:
            data = (f"postgresql://governance_evidence_worker:{passwords['governance_evidence_worker']}@127.0.0.1:5433/governance_test?sslmode=disable\n").encode()
        else:
            role = 'governance_api' if file == API_ENV else 'governance_evidence_worker'
            url = f'postgresql://{role}:{quote(passwords[role], safe="")}@127.0.0.1:5433/governance_test?sslmode=disable'
            data = update_env(file.read_text(encoding='utf-8'), url)
        atomic_bytes(file, data, info)
    return rollback


def restore_settings(rollback):
    manifest = json.loads(protected(rollback / 'manifest.json', 8192))
    for entry in manifest:
        file = pathlib.Path(entry['path'])
        info = file.lstat()
        if (info.st_uid, info.st_gid, stat.S_IMODE(info.st_mode)) != \
                (entry['uid'], entry['gid'], entry['mode']):
            raise RuntimeError('Rollback file metadata changed unexpectedly')
        atomic_bytes(file, (rollback / pathlib.Path(entry['snapshot']).name).read_bytes(), info)


def apply():
    binding, passwords, files, units = preflight()
    lock = os.open('/run/orvessian-pilot-db-cutover.lock', os.O_WRONLY | os.O_CREAT, 0o600)
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    stopped = False
    rollback = None
    try:
        for timer in TIMERS:
            run(('systemctl', 'stop', timer), timeout=30)
        for unit in ('orvessian-pilot-self-service.service', 'orvessian-pilot-identity-replay.service',
                     'orvessian-internal-responses-canary.service', *FIXED_SERVICES, *units):
            run(('systemctl', 'stop', unit), timeout=45)
        stopped = True
        print('Pilot writers: QUIESCED', flush=True)
        copy_final(binding, passwords)
        print('Fresh local PostgreSQL 17 copy: RESTORED', flush=True)
        print('Matching public tables:', fingerprints(binding), flush=True)
        rollback = ROOT / 'cutover-rollback'
        replace_settings(files, passwords)
        print('Protected service settings: LOCAL', flush=True)
        run(('python3', str(BACKUP), '--offline-cutover'), timeout=900)
        print('Coordinated local PostgreSQL and journal B2 upload: COMPLETE', flush=True)
        for unit in (*units, 'aichain-governance-synthetic-api.service',
                     'orvessian-pilot-portal.service'):
            run(('systemctl', 'start', unit), timeout=45)
        for timer in TIMERS:
            run(('systemctl', 'start', timer), timeout=30)
        run(('python3', str(SETUP / 'check-pilot-hosted-health.py')), timeout=90)
        run(('python3', str(SETUP / 'check-pilot-backup-health.py')), timeout=45)
        print('Pilot local cutover: HEALTHY; managed source retained for rollback', flush=True)
    except Exception:
        if stopped:
            for unit in (*FIXED_SERVICES, *units):
                subprocess.run(('systemctl', 'stop', unit), capture_output=True, timeout=45)
            if rollback is not None and (rollback / 'manifest.json').is_file():
                restore_settings(rollback)
            for unit in (*units, 'aichain-governance-synthetic-api.service',
                         'orvessian-pilot-portal.service'):
                subprocess.run(('systemctl', 'start', unit), capture_output=True, timeout=45)
            for timer in TIMERS:
                subprocess.run(('systemctl', 'start', timer), capture_output=True, timeout=30)
            print('Cutover failed; managed service settings restored when available', flush=True)
        raise
    finally:
        os.close(lock)


if __name__ == '__main__':
    if sys.argv[1:] not in (['--preflight'], ['--apply']):
        raise SystemExit('Usage: cutover-contabo-pilot-db.py --preflight|--apply')
    try:
        if sys.argv[1:] == ['--preflight']:
            preflight()
            print('Contabo pilot database cutover preflight: READY')
        else:
            apply()
    except (OSError, RuntimeError, ValueError, KeyError, subprocess.TimeoutExpired) as error:
        print('Contabo pilot database cutover not accepted: ' + str(error))
        raise SystemExit(1) from None
