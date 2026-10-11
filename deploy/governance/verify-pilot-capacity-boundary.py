#!/usr/bin/env python3
"""Rollback-only probe that the sixth pilot project is rejected by PostgreSQL."""
import os
import pathlib
import stat
import subprocess
from pilot_db_binding import load_admin, psql_dsn, psql_environment

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
    binding = load_admin()
    result = subprocess.run(('psql', '-X', '-q', '-w', '-v', 'ON_ERROR_STOP=1',
                             '-d', psql_dsn(binding), '-c', SQL), env=psql_environment(binding), capture_output=True,
                            text=True, timeout=30, check=False)
    if result.returncode != 0:
        raise ValueError('Rollback-only capacity probe failed')
    print('pilot_capacity_boundary=passed;changes=rolled_back')


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, subprocess.TimeoutExpired):
        print('Pilot capacity boundary probe failed; no credentials printed.')
        raise SystemExit(1) from None
