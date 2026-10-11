#!/usr/bin/env python3
"""Create and verify the production API database login without starting service."""

import argparse
import importlib.util
import os
import pathlib
import secrets
import subprocess
import tempfile


SETUP = pathlib.Path('/opt/aichain/governance-pilot-db-setup')
RELEASE = pathlib.Path('/opt/aichain/orvessian-production-api')
DESTINATION = pathlib.Path('/etc/orvessian-production-api.env')
NODE = pathlib.Path('/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node')
HOST = 'orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com'
ROLE = 'governance_prod_api'
MODULE = SETUP / 'apply-production-schema.py'
CHECK = r'''
const {Pool}=require('pg');
const {connectionOptions}=require('./services/governance/postgres-connection.cjs');
const {verifyProfile}=require('./services/governance/postgres-runtime-profile.cjs');
const pool=new Pool(connectionOptions(process.env.GOVERNANCE_DATABASE_URL,
  {caFile:process.env.GOVERNANCE_DATABASE_CA_FILE}));
verifyProfile(pool,'api').then(result=>{if(result.validated!==true)throw Error();
  console.log('production_api_grants=verified');}).catch(()=>{
  console.error('Production API grant verification failed');process.exitCode=1;
}).finally(()=>pool.end());
'''


def schema_module():
    spec = importlib.util.spec_from_file_location('production_schema', MODULE)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def state(module):
    if os.geteuid() != 0 or DESTINATION.exists() or DESTINATION.is_symlink():
        raise ValueError('Root and absent production API configuration required')
    if not NODE.is_file() or not RELEASE.is_dir():
        raise ValueError('Pinned production API release required')
    if module.psql('doadmin', module.protected(module.ADMIN, 1025),
                   "SELECT count(*) FROM governance_migrations;") != '19':
        raise ValueError('Expected production schema required')
    role = module.psql('doadmin', module.protected(module.ADMIN, 1025),
                       "SELECT rolcanlogin::text FROM pg_roles "
                       "WHERE rolname='governance_prod_api';")
    if role != 'false':
        raise ValueError('Production API role must have no login')
    unit = subprocess.run(('systemctl', 'show', 'orvessian-production-api.service',
                           '-p', 'UnitFileState', '-p', 'ActiveState'),
                          text=True, capture_output=True, timeout=15, check=False)
    if unit.returncode or set(unit.stdout.splitlines()) != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Production API must remain disabled')


def install(module):
    admin = module.protected(module.ADMIN, 1025)
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
                                env=env, text=True, capture_output=True,
                                timeout=45, check=False)
        env['GOVERNANCE_DATABASE_URL'] = ''
        if result.returncode or result.stdout.strip() != 'production_api_grants=verified':
            raise ValueError('Production API grant verification failed')
        content = ('GOVERNANCE_DATABASE_URL=' + url + '\n'
                   'GOVERNANCE_DATABASE_CA_FILE=' + str(module.CA) + '\n'
                   'GOVERNANCE_IDENTITY_SEAL_KEY=' + secrets.token_hex(32) + '\n')
        fd, temporary = tempfile.mkstemp(prefix='.production-api-', dir='/etc')
        try:
            with os.fdopen(fd, 'w', encoding='ascii') as handle:
                os.fchmod(handle.fileno(), 0o600)
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temporary, DESTINATION)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
        completed = True
    finally:
        if not completed:
            module.psql('doadmin', admin, f'ALTER ROLE {ROLE} NOLOGIN PASSWORD NULL;')
    print('production_api_login=installed;api_grants=verified;api_service=disabled')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    module = schema_module()
    state(module)
    if args.apply:
        install(module)
    else:
        print('production_api_login=ready;mode=read-only;api_service=disabled')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        raise SystemExit('Production API database setup failed; inspect state; no secret printed') from None
