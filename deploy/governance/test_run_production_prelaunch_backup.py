"""Failure-boundary tests for the closed Production backup runner."""

import importlib.util
import json
import os
import pathlib
import tempfile
import unittest
from datetime import datetime, timezone
from contextlib import redirect_stdout
from io import StringIO
from unittest import mock


SCRIPT = pathlib.Path(__file__).with_name('run-production-prelaunch-backup.py')
SPEC = importlib.util.spec_from_file_location('production_prelaunch_backup', SCRIPT)
BACKUP = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BACKUP)
HEALTH_SPEC = importlib.util.spec_from_file_location(
    'production_prelaunch_backup_health',
    pathlib.Path(__file__).with_name('check-production-prelaunch-backup-health.py'))
HEALTH = importlib.util.module_from_spec(HEALTH_SPEC)
HEALTH_SPEC.loader.exec_module(HEALTH)


class Schema:
    ADMIN = pathlib.Path('/private/admin')
    HOST = 'managed.example.test'
    CA = pathlib.Path('/private/ca.crt')

    def __init__(self, projects='0'):
        self.projects = projects

    def protected(self, path, maximum):
        if str(path).endswith('backup.key'):
            return 'a' * 64
        if str(path).endswith('b2-upload-credentials.json'):
            return '{"accessKeyId":"test","secretAccessKey":"test"}'
        return 'admin-password'

    def psql(self, user, password, sql):
        return self.projects if 'governance_customer_projects' in sql else 'prod'


class ProductionPrelaunchBackupTests(unittest.TestCase):
    def test_backup_health_rejects_project_or_worker_after_capture(self):
        with tempfile.TemporaryDirectory() as temporary:
            pointer = pathlib.Path(temporary) / 'latest-b2.json'
            pointer.write_text(json.dumps({
                'version': 2, 'environment': 'prod',
                'bucket': 'orvessian-prod-backups-2026',
                'keyPrefix': 'orvessian-production/prod/example',
                'journalRoles': []}), encoding='utf-8')
            pointer.chmod(0o600)
            now = datetime(2026, 10, 14, 2, 30, tzinfo=timezone.utc).timestamp()
            os.utime(pointer, (now - 60, now - 60))
            with mock.patch.object(HEALTH, 'POINTER', pointer), \
                    mock.patch.object(HEALTH.os, 'geteuid', return_value=0), \
                    mock.patch.object(HEALTH.time, 'time', return_value=now), \
                    mock.patch.object(HEALTH, 'systemctl', side_effect=lambda *args:
                                      'enabled' if args[0] == 'is-enabled' else
                                      'success' if args[0] == 'show' else
                                      'inactive' if 'portal' in args[-1] else 'active'):
                for scope in ((True, True, True), (True, False, True),
                              (True, True, False)):
                    with mock.patch.object(HEALTH, 'closed_scope', return_value=scope), \
                            redirect_stdout(StringIO()) as output:
                        if all(scope):
                            HEALTH.main()
                        else:
                            with self.assertRaises(SystemExit) as failure:
                                HEALTH.main()
                            self.assertEqual(failure.exception.code, 1)
                    self.assertEqual(json.loads(output.getvalue())['healthy'], all(scope))

    def test_inactive_portal_status_is_not_unavailable(self):
        with mock.patch.object(HEALTH.subprocess, 'run',
                               return_value=mock.Mock(returncode=3, stdout='inactive\n')):
            self.assertEqual(HEALTH.systemctl('is-active', BACKUP.PORTAL), 'inactive')

    def test_scheduled_window_is_due_after_one_hour(self):
        before = datetime(2026, 10, 14, 2, 59, tzinfo=timezone.utc).timestamp()
        after = datetime(2026, 10, 14, 3, 0, tzinfo=timezone.utc).timestamp()
        self.assertEqual(HEALTH.latest_due(before).isoformat(),
                         '2026-10-13T02:00:00+00:00')
        self.assertEqual(HEALTH.latest_due(after).isoformat(),
                         '2026-10-14T02:00:00+00:00')

    def service(self, unit):
        if unit == BACKUP.API:
            return {'UnitFileState=enabled', 'ActiveState=active'}
        if unit == BACKUP.PORTAL:
            return {'UnitFileState=disabled', 'ActiveState=inactive'}
        return {'UnitFileState=', 'ActiveState=inactive'}

    def test_preflight_fails_closed_when_a_project_exists(self):
        with mock.patch.object(BACKUP.os, 'geteuid', return_value=0), \
                mock.patch.object(BACKUP, 'status', side_effect=self.service), \
                mock.patch.object(BACKUP.pathlib.Path, 'is_file', return_value=True):
            with self.assertRaisesRegex(ValueError, 'journal-aware'):
                BACKUP.preflight(Schema(projects='1'))

    def test_capture_failure_restarts_the_private_api(self):
        calls = []
        real_temporary = tempfile.TemporaryDirectory

        def run(*args, **kwargs):
            calls.append(args)
            if args[:2] == (BACKUP.NODE, 'scripts/governance-postgres-recovery.cjs'):
                raise ValueError('simulated capture failure')
            return mock.Mock(stdout='')

        def service(unit):
            if unit == BACKUP.API and any(call[:2] == ('systemctl', 'stop')
                                          for call in calls) and not any(
                    call[:2] == ('systemctl', 'start') for call in calls):
                return {'UnitFileState=enabled', 'ActiveState=inactive'}
            return self.service(unit)

        with tempfile.TemporaryDirectory() as temporary, \
                mock.patch.object(BACKUP.tempfile, 'TemporaryDirectory',
                                  side_effect=lambda **kwargs: real_temporary(
                                      dir=temporary)), \
                mock.patch.object(BACKUP, 'run', side_effect=run), \
                mock.patch.object(BACKUP, 'status', side_effect=service), \
                mock.patch.object(BACKUP.subprocess, 'run',
                                  return_value=mock.Mock(returncode=0, stdout='200')):
            with self.assertRaisesRegex(ValueError, 'simulated capture failure'):
                BACKUP.capture_and_upload(Schema(), 'admin-password')
        self.assertIn(('systemctl', 'stop', BACKUP.API), calls)
        self.assertIn(('systemctl', 'start', BACKUP.API), calls)

    def test_upload_follows_capture_and_api_restart(self):
        calls = []
        backup_id = '11111111-1111-4111-8111-111111111111'
        real_temporary = tempfile.TemporaryDirectory
        with tempfile.TemporaryDirectory() as temporary:
            archives = pathlib.Path(temporary) / 'archives'
            directory = archives / 'pg-backup-example'
            directory.mkdir(parents=True)

            def run(*args, **kwargs):
                calls.append(args)
                if args[:3] == (BACKUP.NODE,
                                 'scripts/governance-postgres-recovery.cjs', 'backup'):
                    return mock.Mock(stdout=json.dumps({
                        'operation': 'backup', 'environment': 'prod',
                        'journalRoles': [], 'id': backup_id,
                        'directory': str(directory)}))
                if args[:3] == (BACKUP.NODE,
                                 'scripts/governance-backup-object-storage.cjs',
                                 'upload'):
                    return mock.Mock(stdout=json.dumps({
                        'operation': 'upload', 'environment': 'prod',
                        'bucket': BACKUP.BUCKET, 'journalRoles': [],
                        'id': backup_id, 'upload': 'complete-marker-written'}))
                return mock.Mock(stdout='')

            def service(unit):
                if unit == BACKUP.API and any(call[:2] == ('systemctl', 'stop')
                                              for call in calls) and not any(
                        call[:2] == ('systemctl', 'start') for call in calls):
                    return {'UnitFileState=enabled', 'ActiveState=inactive'}
                return self.service(unit)

            with mock.patch.object(BACKUP, 'ARCHIVES', archives), \
                    mock.patch.object(BACKUP.tempfile, 'TemporaryDirectory',
                                      side_effect=lambda **kwargs: real_temporary(
                                          dir=temporary)), \
                    mock.patch.object(BACKUP, 'run', side_effect=run), \
                    mock.patch.object(BACKUP, 'status', side_effect=service), \
                    mock.patch.object(BACKUP.subprocess, 'run',
                                      return_value=mock.Mock(returncode=0,
                                                             stdout='200')):
                BACKUP.capture_and_upload(Schema(), 'admin-password')

        self.assertLess(calls.index(('systemctl', 'stop', BACKUP.API)),
                        next(i for i, item in enumerate(calls) if item[:3] ==
                             (BACKUP.NODE,
                              'scripts/governance-postgres-recovery.cjs', 'backup')))
        self.assertLess(calls.index(('systemctl', 'start', BACKUP.API)),
                        next(i for i, item in enumerate(calls) if item[:3] ==
                             (BACKUP.NODE,
                              'scripts/governance-backup-object-storage.cjs',
                              'upload')))


if __name__ == '__main__':
    unittest.main()
