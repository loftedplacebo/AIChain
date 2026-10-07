#!/usr/bin/env python3
"""Rollback-only probe that the sixth pilot project is rejected by PostgreSQL."""
import os
import pathlib
import stat
import subprocess

PASSWORD = pathlib.Path('/etc/aichain/pilot-backup/database-password')
DSN = ('host=orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com '
       'port=25060 dbname=governance_test user=doadmin sslmode=verify-full '
       'sslrootcert=/etc/aichain/governance/digitalocean-ca.crt')
SQL = """
BEGIN;
SET LOCAL ROLE governance_migrations;
SET LOCAL governance.customer_workspace = 'org-61f98eac-1218-439d-9e93-f3717e1dfe37';
UPDATE public.governance_pilot_project_capacity SET used=max_projects WHERE singleton;
DO $$
DECLARE blocked boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.governance_customer_projects(id,workspace,name,created)
    VALUES ('prj-00000000-0000-4000-8000-000000000001',
            'org-61f98eac-1218-439d-9e93-f3717e1dfe37',
            'Rollback-only capacity probe',0);
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    blocked := true;
  END;
  IF NOT blocked THEN
    RAISE EXCEPTION 'Pilot project capacity trigger did not reject';
  END IF;
END $$;
ROLLBACK;
"""


def main():
    if os.geteuid() != 0:
        raise ValueError('Root required')
    info = PASSWORD.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or \
            stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError('Protected database credential required')
    env = {**os.environ, 'PGPASSWORD': PASSWORD.read_text(encoding='utf-8').strip()}
    result = subprocess.run(('psql', '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
                             '-d', DSN, '-c', SQL), env=env, capture_output=True,
                            text=True, timeout=30, check=False)
    env.pop('PGPASSWORD', None)
    if result.returncode != 0:
        raise ValueError('Rollback-only capacity probe failed')
    print('pilot_capacity_boundary=passed;changes=rolled_back')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print('Pilot capacity boundary probe failed; no credentials printed.')
        raise SystemExit(1) from None
