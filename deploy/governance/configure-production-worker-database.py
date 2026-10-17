#!/usr/bin/env python3
"""Install the restricted Production worker database login while workers are off."""

import argparse
import importlib.util
import json
import os
import pathlib
import secrets
import stat
import subprocess
import tempfile

from production_worker_registry import load_registry


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
SCHEMA = SETUP / 'apply-production-schema.py'
HEALTH = SETUP / 'check-production-prelaunch-backup-health.py'
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-worker')
DESTINATION = pathlib.Path('/etc/aichain/production/worker-database-url')
NODE = pathlib.Path('/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
ROLE = 'governance_prod_worker'
UNIT = 'orvessian-production-project-worker@000000000000000000000000.service'
CHECK = r'''
const {Pool}=require('pg');
const {connectionOptions}=require('./services/governance/postgres-connection.cjs');
const {verifyProfile}=require('./services/governance/postgres-runtime-profile.cjs');
const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,
  {caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
(async()=>{await verifyProfile(pool,'evidence-worker');
  const result=await pool.query('SELECT name FROM governance_environment');
  if(result.rows.length!==1||result.rows[0].name!=='prod')throw Error();
  console.log('production_worker_grants=verified');
})().catch(()=>{console.error('Production worker grant verification failed');
  process.exitCode=1;}).finally(()=>pool.end());
'''


def schema_module():
    spec = importlib.util.spec_from_file_location('production_schema', SCHEMA)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def unit_state(unit):
    result = subprocess.run(('systemctl', 'show', unit, '-p', 'UnitFileState',
                             '-p', 'ActiveState'), capture_output=True,
                            text=True, timeout=15, check=False)
    return set(result.stdout.splitlines()) if result.returncode == 0 else set()


def preflight(module):
    if os.geteuid() != 0 or DESTINATION.exists() or DESTINATION.is_symlink():
        raise ValueError('Root and absent Production worker database URL required')
    if not NODE.is_file() or not RELEASE.is_dir() or not module.CA.is_file():
        raise ValueError('Reviewed Production worker runtime and database CA required')
    parent = DESTINATION.parent.lstat()
    if not stat.S_ISDIR(parent.st_mode) or parent.st_uid != 0 or parent.st_mode & 0o077:
        raise ValueError('Protected Production database URL directory required')
    document, workers = load_registry()
    if document['chain'] is None or workers:
        raise ValueError('Bound mainnet anchor and zero workers required')
    if unit_state(UNIT) != {'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production worker template must be inactive')
    admin = module.protected(module.ADMIN, 1025)
    if module.psql('doadmin', admin, 'SELECT name FROM governance_environment;') != 'prod' or \
            module.psql('doadmin', admin, 'SELECT count(*) FROM governance_migrations;') != '19' or \
            module.psql('doadmin', admin, "SELECT count(*) FROM governance_customer_projects;") != '0' or \
            module.psql('doadmin', admin,
                        "SELECT rolcanlogin::text FROM pg_roles WHERE rolname='governance_prod_worker';") != 'false':
        raise ValueError('Closed Production database and NOLOGIN worker role required')
    health = subprocess.run(('python3', str(HEALTH)), capture_output=True,
                            text=True, timeout=45, check=False)
    if health.returncode or json.loads(health.stdout).get('healthy') is not True:
        raise ValueError('Production prelaunch backup and private API must be healthy')
    return admin


def install(module, admin):
    password = secrets.token_hex(32)
    verifier = module.scram_verifier(password)
    url = (f'postgresql://{ROLE}:{password}@{HOST}:25060/'
           'governance_prod?sslmode=verify-full')
    module.psql('doadmin', admin, f"ALTER ROLE {ROLE} LOGIN PASSWORD '{verifier}';")
    completed = False
    try:
        env = {key: value for key, value in os.environ.items() if not key.startswith('PG')}
        env.update(GOVERNANCE_DATABASE_URL=url,
                   GOVERNANCE_DATABASE_CA_FILE=str(module.CA))
        result = subprocess.run((str(NODE), '-e', CHECK), cwd=RELEASE,
                                env=env, capture_output=True, text=True,
                                timeout=45, check=False)
        env['GOVERNANCE_DATABASE_URL'] = ''
        if result.returncode or result.stdout.strip() != 'production_worker_grants=verified':
            raise ValueError('Restricted Production worker grants failed verification')
        descriptor, temporary = tempfile.mkstemp(
            prefix='.worker-database-', dir=DESTINATION.parent)
        try:
            with os.fdopen(descriptor, 'w', encoding='ascii') as output:
                os.fchmod(output.fileno(), 0o600)
                output.write(url + '\n')
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, DESTINATION)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        completed = True
    finally:
        if not completed:
            module.psql('doadmin', admin, f'ALTER ROLE {ROLE} NOLOGIN PASSWORD NULL;')
    print('production_worker_database=installed;grants=verified;workers=off')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    module = schema_module()
    admin = preflight(module)
    if args.apply:
        install(module, admin)
    else:
        print('production_worker_database=ready;mode=read-only;workers=off')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, TypeError, KeyError, subprocess.TimeoutExpired):
        raise SystemExit('Production worker database setup failed; no credential printed '
                         'or worker activated') from None
