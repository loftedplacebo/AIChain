#!/usr/bin/env python3
"""Read-only check of the owner-requested on-demand backup and closed restore."""

import json
import os
import pathlib
import subprocess

from pilot_db_binding import load_admin


POINTER = pathlib.Path('/etc/aichain/pilot-backup/latest-upload.json')
BACKUP_ID = 'c79ba135-5b42-417e-b3bd-cd1955853f12'
RESTORE_DB = 'gov_restore_b2_a451c6e5b6b2'
PSQL = '/usr/lib/postgresql/17/bin/psql'


def main():
    if os.geteuid() != 0 or load_admin()['profile'] != 'contabo-local':
        raise ValueError('Active local pilot binding required')
    pointer = json.loads(POINTER.read_text(encoding='utf-8'))
    prefix = pointer.get('keyPrefix')
    if not isinstance(prefix, str) or \
            not prefix.startswith('orvessian-pilot/test/' + BACKUP_ID + '-') or \
            pointer.get('environment') != 'test' or \
            pointer.get('bucket') != 'orvessian-pilot-test-backups' or \
            not isinstance(pointer.get('journalRoles'), list) or \
            len(pointer['journalRoles']) != 4:
        raise ValueError('Latest completed backup is not the reviewed restored set')
    def query(database: str, sql: str) -> dict:
        result = subprocess.run(('sudo', '-u', 'postgres', PSQL, '-p', '5433',
                                 '-d', database, '-X', '-q', '-t', '-A', '-w',
                                 '-v', 'ON_ERROR_STOP=1', '-c', sql),
                                capture_output=True, text=True, timeout=15,
                                check=False)
        if result.returncode:
            raise ValueError('Reviewed restored database query failed')
        return json.loads(result.stdout)

    database = query('postgres', """SELECT json_build_object(
      'name',datname,'connections',(SELECT count(*) FROM pg_stat_activity
       WHERE datname='gov_restore_b2_a451c6e5b6b2'),
      'publicConnect',EXISTS(SELECT 1 FROM
       aclexplode(COALESCE(datacl,acldefault('d',datdba))) acl
       WHERE acl.grantee=0 AND acl.privilege_type='CONNECT'))
      FROM pg_database WHERE datname='gov_restore_b2_a451c6e5b6b2'""")
    access = query(RESTORE_DB, """SELECT json_build_object(
      'gate',(SELECT state FROM governance_recovery_gate),
      'sessions',(SELECT count(*) FROM governance_customer_sessions),
      'authFlows',(SELECT count(*) FROM governance_customer_auth_flows),
      'activeKeys',(SELECT count(*) FROM governance_project_keys WHERE revoked_at IS NULL),
      'enabledIdentities',(SELECT count(*) FROM governance_customer_identities WHERE NOT disabled))""")
    if database != {'name': RESTORE_DB, 'connections': 0,
                    'publicConnect': False} or access != {
                        'gate': 'review-required', 'sessions': 0,
                        'authFlows': 0, 'activeKeys': 0,
                        'enabledIdentities': 0}:
        raise ValueError('Reviewed restored database is not closed')
    print(json.dumps({'healthy': True, 'backupId': BACKUP_ID,
                      'restoredDatabase': RESTORE_DB,
                      'restoredDatabaseClosed': True,
                      'registeredJournalRoles': 4}, sort_keys=True))


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, KeyError, subprocess.TimeoutExpired,
            json.JSONDecodeError) as error:
        raise SystemExit('Accelerated retirement checkpoint failed: ' + str(error)) from None
